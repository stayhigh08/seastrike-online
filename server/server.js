// server/server.js
const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const connectDB = require('./db');
const Lobby = require('./models/lobby');
const { createComputerFleet, checkAttack } = require('./game-logic');

connectDB();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

// --- LOBBY API ENDPOINTS ---
app.get('/api/lobbies', async (req, res) => {
    try {
        const lobbies = await Lobby.find({ status: 'waiting' });
        res.json(lobbies);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching lobbies' });
    }
});

// --- IN-MEMORY STORES ---
const gameStates = {}; // Stores state for active games
const clients = {};    // Stores connected clients by their ID

// --- HELPER FUNCTION TO BROADCAST LOBBY UPDATES ---
const broadcastLobbyUpdate = async () => {
    try {
        const lobbies = await Lobby.find({ status: 'waiting' });
        const message = JSON.stringify({ type: 'lobbyUpdate', lobbies });
        
        // Only send to clients who are not currently in a game
        for (const clientId in clients) {
            if (!clients[clientId].lobbyId) {
                clients[clientId].send(message);
            }
        }
    } catch (error) {
        console.error('Failed to broadcast lobby update:', error);
    }
};

wss.on('connection', (ws) => {
    const clientId = `client_${Date.now()}_${Math.random()}`;
    clients[clientId] = ws;
    ws.clientId = clientId;
    console.log(`Client ${clientId} connected.`);

    ws.on('message', async (message) => {
        const data = JSON.parse(message);

        switch(data.type) {
            case 'createLobby': {
                try {
                    const lobby = new Lobby({
                        hostName: data.playerName,
                        players: [{ playerName: data.playerName, playerId: ws.clientId }]
                    });
                    await lobby.save();
                    ws.lobbyId = lobby._id.toString();
                    ws.send(JSON.stringify({ type: 'lobbyCreated', lobbyId: ws.lobbyId }));
                    broadcastLobbyUpdate();
                } catch (error) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Failed to create lobby.' }));
                }
                break;
            }

            case 'joinLobby': {
                try {
                    const lobby = await Lobby.findById(data.lobbyId);
                    if (!lobby || lobby.players.length >= 2) {
                        return ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found or is full.' }));
                    }

                    lobby.players.push({ playerName: data.playerName, playerId: ws.clientId });
                    lobby.status = 'in-progress';
                    await lobby.save();
                    
                    ws.lobbyId = lobby._id.toString();

                    // Initialize game state
                    gameStates[ws.lobbyId] = {
                        players: lobby.players,
                        playerData: {
                            [lobby.players[0].playerId]: { ships: [], ready: false },
                            [lobby.players[1].playerId]: { ships: [], ready: false },
                        },
                        turn: lobby.players[0].playerId // Host goes first
                    };

                    lobby.players.forEach(player => {
                        const client = clients[player.playerId];
                        if (client) {
                            client.lobbyId = ws.lobbyId; // Assign lobbyId to both clients
                            client.send(JSON.stringify({ type: 'gameStart', lobbyId: ws.lobbyId, playerId: player.playerId }));
                        }
                    });

                    broadcastLobbyUpdate();
                } catch (error) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Failed to join lobby.' }));
                }
                break;
            }

            case 'placeShips': {
                const { lobbyId, playerId, ships } = data;
                const game = gameStates[lobbyId];
                if (game && game.playerData[playerId]) {
                    game.playerData[playerId].ships = ships;
                    game.playerData[playerId].ready = true;
                    
                    const player1 = game.players[0].playerId;
                    const player2 = game.players[1].playerId;

                    // If both players are ready, start the game
                    if (game.playerData[player1].ready && game.playerData[player2].ready) {
                        const startMessage = JSON.stringify({ type: 'gameReady', turn: game.turn });
                        clients[player1]?.send(startMessage);
                        clients[player2]?.send(startMessage);
                    }
                }
                break;
            }
            
            case 'attack': {
                const { lobbyId, playerId, cellId } = data;
                const game = gameStates[lobbyId];

                // Validate turn
                if (!game || game.turn !== playerId) return;

                const opponentId = game.players.find(p => p.playerId !== playerId).playerId;
                const opponentShips = game.playerData[opponentId].ships;
                
                const { hit, sunkShip } = checkAttack(opponentShips, cellId);

                const resultPayload = { type: 'attackResult', cellId, hit, sunkShip, attacker: playerId };
                
                // Send result to both players
                clients[playerId]?.send(JSON.stringify(resultPayload));
                clients[opponentId]?.send(JSON.stringify(resultPayload));

                // Check for win condition
                const allShipsSunk = opponentShips.every(ship => ship.hits.length === ship.cells.length);
                if (allShipsSunk) {
                    const gameOverPayload = JSON.stringify({ type: 'gameOver', winner: playerId });
                    clients[playerId]?.send(gameOverPayload);
                    clients[opponentId]?.send(gameOverPayload);
                    delete gameStates[lobbyId]; // Clean up finished game
                    Lobby.deleteOne({_id: lobbyId}); // also remove from db
                    return;
                }

                // If it was a miss, switch turns
                if (!hit) {
                    game.turn = opponentId;
                    const turnChangePayload = JSON.stringify({ type: 'turnChange', turn: game.turn });
                    clients[playerId]?.send(turnChangePayload);
                    clients[opponentId]?.send(turnChangePayload);
                }
                break;
            }
        }
    });

    ws.on('close', async () => {
        console.log(`Client ${ws.clientId} disconnected.`);
        const lobbyId = ws.lobbyId;
        
        if (lobbyId) {
            const game = gameStates[lobbyId];
            if (game) {
                // Handle mid-game disconnect
                const opponentId = game.players.find(p => p.playerId !== ws.clientId)?.playerId;
                clients[opponentId]?.send(JSON.stringify({ type: 'opponentDisconnected' }));
                delete gameStates[lobbyId];
                await Lobby.deleteOne({ _id: lobbyId });

            } else {
                // Handle disconnect from a waiting lobby
                await Lobby.deleteOne({ _id: lobbyId, status: 'waiting' });
            }
            broadcastLobbyUpdate();
        }
        delete clients[ws.clientId];
    });
});


const PORT = process.env.PORT || 8080;
// Make sure this line is listening on 0.0.0.0
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
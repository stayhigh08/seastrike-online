// server/models/lobby.js
const mongoose = require('mongoose');

const LobbySchema = new mongoose.Schema({
    hostName: { type: String, required: true },
    players: [{
        playerName: String,
        playerId: String // We can use WebSocket IDs here
    }],
    status: { type: String, default: 'waiting' }, // waiting, in-progress, finished
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Lobby', LobbySchema);
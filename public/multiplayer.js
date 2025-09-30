// public/multiplayer.js
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const playerNameInput = document.getElementById('player-name-input');
    const createLobbyBtn = document.getElementById('create-lobby-btn');
    const lobbyList = document.getElementById('lobby-list');
    const noLobbiesMessage = document.getElementById('no-lobbies-message');
    const waitingMessage = document.getElementById('waiting-message');
    const lobbyActions = document.getElementById('lobby-actions');

    let localPlayerName = '';

    // --- MODIFIED: Use secure protocol if on a secure page ---
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${window.location.host}`);

    ws.onopen = () => {
        console.log('Connected to the multiplayer server.');
        // --- REMOVED: No longer need to fetch on open, server will push updates ---
    };

    ws.onclose = () => {
        console.log('Disconnected from server.');
        alert('Connection to the server has been lost. Please refresh the page.');
    };

    // --- Handle Messages from Server ---
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case 'lobbyUpdate':
                renderLobbies(data.lobbies);
                break;
            
            case 'lobbyCreated':
                lobbyActions.classList.add('hidden');
                waitingMessage.classList.remove('hidden');
                break;

            case 'gameStart':
                console.log(`Game starting! Lobby ID: ${data.lobbyId}, Player ID: ${data.playerId}`);
                // --- MODIFIED: Changed from index.html to '/' for cleaner URLs ---
                window.location.href = `/?gameId=${data.lobbyId}&playerId=${data.playerId}`;
                break;
            
            case 'error':
                alert(`Error: ${data.message}`);
                lobbyActions.classList.remove('hidden');
                waitingMessage.classList.add('hidden');
                break;
        }
    };

    // --- Functions to Interact with UI and Server ---
    
    // --- REMOVED: fetchLobbies function is no longer needed ---

    const renderLobbies = (lobbies) => {
        lobbyList.innerHTML = ''; 

        if (!lobbies || lobbies.length === 0) {
            noLobbiesMessage.classList.remove('hidden');
        } else {
            noLobbiesMessage.classList.add('hidden');
            lobbies.forEach(lobby => {
                const lobbyItem = document.createElement('li');
                lobbyItem.className = 'lobby-item';

                const lobbyName = document.createElement('span');
                // --- FIX: Handle case where players array might be empty ---
                const host = lobby.players[0]?.playerName || lobby.hostName;
                lobbyName.textContent = `${host}'s Game (${lobby.players.length}/2)`;
                
                const joinButton = document.createElement('button');
                joinButton.textContent = 'Join';
                joinButton.className = 'btn btn--primary';
                joinButton.onclick = () => joinLobby(lobby._id);

                lobbyItem.appendChild(lobbyName);
                lobbyItem.appendChild(joinButton);
                lobbyList.appendChild(lobbyItem);
            });
        }
    };

    const createLobby = () => {
        const playerName = playerNameInput.value.trim();
        if (!playerName) {
            alert('Please enter your name first!');
            return;
        }
        localPlayerName = playerName;
        ws.send(JSON.stringify({ type: 'createLobby', playerName }));
    };

    const joinLobby = (lobbyId) => {
        const playerName = playerNameInput.value.trim();
        if (!playerName) {
            alert('Please enter your name to join a lobby!');
            return;
        }
        localPlayerName = playerName;
        ws.send(JSON.stringify({ type: 'joinLobby', lobbyId, playerName }));
    };

    // --- Event Listeners ---
    createLobbyBtn.addEventListener('click', createLobby);

    // --- REMOVED: The interval is no longer needed as the server pushes updates ---
});
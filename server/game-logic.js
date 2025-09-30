// server/game-logic.js

const gridSize = 9;

function getShipCells(startId, size, orientation) {
    const cells = [];
    if (orientation === 'horizontal') {
        if ((startId % gridSize) + size > gridSize) return { cells, isValid: false };
        for (let i = 0; i < size; i++) cells.push(startId + i);
    } else {
        if (startId + (size - 1) * gridSize >= gridSize * gridSize) return { cells, isValid: false };
        for (let i = 0; i < size; i++) cells.push(startId + i * gridSize);
    }
    return { cells, isValid: true };
}

function checkAttack(ships, cellId) {
    let hit = false, sunkShip = null;
    for (const ship of ships) {
        if (ship.cells.includes(cellId) && !ship.hits.includes(cellId)) {
            hit = true;
            ship.hits.push(cellId);
            if (ship.hits.length === ship.cells.length) sunkShip = ship;
            break;
        }
    }
    return { hit, sunkShip };
}

function createComputerFleet(shipTemplates) {
    const computerShips = [];
    shipTemplates.forEach(shipInfo => {
        let placed = false;
        while (!placed) {
            const randomOrientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
            const randomStartId = Math.floor(Math.random() * gridSize * gridSize);
            const { cells, isValid } = getShipCells(randomStartId, shipInfo.size, randomOrientation);
            const isTaken = cells.some(id => computerShips.flatMap(s => s.cells).includes(id));
            if (isValid && !isTaken) {
                const shipCount = computerShips.filter(s => s.name === shipInfo.name).length;
                computerShips.push({ name: shipInfo.name, id: `${shipInfo.name}-${shipCount}`, cells, hits: [] });
                placed = true;
            }
        }
    });
    return computerShips;
}

// Simplified AI logic for the server
function getComputerAttack(playerGridState) {
    let randomId;
    do {
        randomId = Math.floor(Math.random() * gridSize * gridSize);
    } while (playerGridState[randomId] === 'hit' || playerGridState[randomId] === 'miss');
    return randomId;
}

module.exports = { 
    createComputerFleet, 
    checkAttack,
    getComputerAttack 
};
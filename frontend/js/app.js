import { state, updateState } from './state.js';
import { initializeUI, updateProgressItems } from './ui.js';
import { setupEventListeners } from './eventHandlers.js';
import { handlePatientLookup } from './eventHandlers.js';

document.addEventListener('DOMContentLoaded', function() {
    initializeUI();
    setupEventListeners();
    updateProgressItems();
    
    // Show welcome popup
    const welcomePopup = document.getElementById('welcomePopup');
    const closePopupBtn = document.getElementById('closePopup');
    
    closePopupBtn.addEventListener('click', () => {
        welcomePopup.classList.add('hidden');
    });
});
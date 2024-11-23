import { state } from './state.js';
import { getTooltipContent } from './utils.js';

export function initializeUI() {
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const micBtn = document.getElementById('micBtn');
    const photoBtn = document.getElementById('photoBtn');
    const generateBtn = document.getElementById('generateBtn');
    const downloadPdfBtn = document.getElementById('downloadPdfBtn');
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    updateProgressItems();
}

export function updateProgressItems() {
    const progressList = document.getElementById('progressList');
    progressList.innerHTML = ''; // Clear existing items
    
    const progressItems = [
        { id: 'symptoms-current', text: 'Past week symptoms' },
        { id: 'symptoms-blood-sugar', text: 'Blood sugar levels' },
        { id: 'symptoms-medications', text: 'Medications' },
        { id: 'symptoms-problems', text: 'Medication issues' },
        { id: 'lifestyle-diet', text: 'Diet' },
        { id: 'lifestyle-activity', text: 'Physical activity' },
        { id: 'lifestyle-mental', text: 'Mental health' },
        { id: 'lifestyle-cognitive', text: 'Cognitive function' },
        { id: 'additional-conditions', text: 'Other conditions' },
        { id: 'additional-healthcare', text: 'Healthcare providers' },
        { id: 'additional-concerns', text: 'Additional concerns' }
    ];
    
    progressItems.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.id = `${item.id}-item`;
        itemElement.className = 'progress-item';
        itemElement.innerHTML = `
            <div class="icon">○</div>
            <div class="text">${item.text}</div>
        `;
        itemElement.setAttribute('data-tooltip', 'Not completed');
        progressList.appendChild(itemElement);
    });
}

export function updateCompletionStatus(completedSections) {
    if (!Array.isArray(completedSections)) {
        console.error('Invalid completedSections data:', completedSections);
        return;
    }

    completedSections.forEach(section => {
        const [category, item] = section.split('-');
        if (state.completedSections[category]) {
            state.completedSections[category].add(item);
            
            // Update UI
            const itemElement = document.getElementById(`${section}-item`);
            if (itemElement) {
                itemElement.classList.add('completed');
                itemElement.querySelector('.icon').textContent = '✓';
                updateTooltip(section);
            } else {
                console.warn(`Element not found: ${section}-item`);
            }
        } else {
            console.warn(`Unknown category: ${category}`);
        }
    });
}

export function updateTooltips() {
    const progressItems = document.querySelectorAll('.progress-item');
    progressItems.forEach(item => {
        const [category, subcategory] = item.id.replace('-item', '').split('-');
        const content = getTooltipContent(category, subcategory);
        item.setAttribute('data-tooltip', content);
    });
}

export function updateTooltip(section) {
    const itemElement = document.getElementById(`${section}-item`);
    if (!itemElement) return;

    const [category, subcategory] = section.split('-');
    const content = getTooltipContent(category, subcategory);
    itemElement.setAttribute('data-tooltip', content);
}

export function addMessageToChat(type, content) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${type}-message`;
    messageDiv.innerHTML = content;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

export function toggleLoadingSpinner(show) {
    document.getElementById('loadingSpinner').classList.toggle('hidden', !show);
}

export async function handleTabChange(tabName) {
    state.currentTab = tabName;
    
    // Update UI
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === `${tabName}Tab`);
    });

    // Handle tab-specific content loading
    switch (tabName) {
        case 'summary':
            await loadDoctorSummary();
            break;
        case 'followup':
            await loadFollowUpContent();
            break;
    }
}

async function loadDoctorSummary() {
    toggleLoadingSpinner(true);

    try {
        const summary = await callCloudFunction('generateDoctorSummary');
        const summaryTab = document.getElementById('summaryTab');
        summaryTab.innerHTML = summary.html;
        
        // Setup event listeners for summary tab interactions
        setupSummaryTabListeners();
    } catch (error) {
        console.error('Error loading doctor summary:', error);
    }

    toggleLoadingSpinner(false);
}

async function loadFollowUpContent() {
    toggleLoadingSpinner(true);

    try {
        const followup = await callCloudFunction('generateFollowUp');
        const followupTab = document.getElementById('followupTab');
        followupTab.innerHTML = followup.html;
    } catch (error) {
        console.error('Error loading follow-up content:', error);
    }

    toggleLoadingSpinner(false);
}

// This function would need to be implemented based on your specific requirements
function setupSummaryTabListeners() {
    // Add event listeners for any interactive elements in the summary tab
}

// You might need to import this function from api.js
import { callCloudFunction } from './api.js';
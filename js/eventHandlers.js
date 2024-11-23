import { state, updateState } from './state.js';
import { updateProgressItems, updateCompletionStatus, addMessageToChat, toggleLoadingSpinner, handleTabChange } from './ui.js';
import { callCloudFunction } from './api.js';
import { autoResizeTextArea } from './utils.js';

export function setupEventListeners() {
    // Tab Navigation
    document.querySelectorAll('.tab-btn').forEach(button => {
        button.addEventListener('click', (e) => handleTabChange(e.target.dataset.tab));
    });

    // Chat Input Auto-resize
    const chatInput = document.getElementById('chatInput');
    chatInput.addEventListener('input', () => {
        autoResizeTextArea(chatInput);
    });

    // Send Message
    document.getElementById('sendBtn').addEventListener('click', handleMessageSend);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleMessageSend();
        }
    });

    // Voice Input
    document.getElementById('micBtn').addEventListener('click', toggleVoiceInput);

    // Photo Upload
    document.getElementById('photoBtn').addEventListener('click', () => {
        document.getElementById('imageInput').click();
    });
    document.getElementById('imageInput').addEventListener('change', handleImageUpload);

    // Generate Demo Answers
    document.getElementById('generateBtn').addEventListener('click', generateDemoAnswers);

    // Download PDF
    document.getElementById('downloadPdfBtn').addEventListener('click', downloadPatientRecord);
}

export async function handleMessageSend() {
    const chatInput = document.getElementById('chatInput');
    const message = chatInput.value.trim();
    if (!message) return;

    // Add user message to chat
    addMessageToChat('user', message);
    chatInput.value = '';
    autoResizeTextArea(chatInput);

    // Show loading state
    toggleLoadingSpinner(true);

    try {
        const response = await callCloudFunction('processMessage', {
            userMessage: message,
            currentRecord: state.currentRecord,
            currentPrompt: state.currentPrompt
        });
        
        // Update current record
        if (response.updated_record) {
            updateState({ currentRecord: { ...state.currentRecord, ...response.updated_record } });
        }
        
        // Update completion status
        if (response.completedSections) {
            updateCompletionStatus(response.completedSections);
        }
        
        // Add bot response to chat
        if (response.message) {
            addMessageToChat('bot', response.message);
        }

        // Update tooltips
        updateProgressItems();
    } catch (error) {
        console.error('Error processing message:', error);
        addMessageToChat('bot', 'Sorry, there was an error processing your message. Please try again.');
    }

    console.log("Current record:", JSON.stringify(state.currentRecord, null, 2));

    toggleLoadingSpinner(false);
}

export function toggleVoiceInput() {
    const micBtn = document.getElementById('micBtn');
    
    if (!state.isRecording) {
        // Start recording
        if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
            alert('Speech recognition is not supported in your browser.');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        
        recognition.continuous = true;
        recognition.interimResults = true;
        
        recognition.onresult = (event) => {
            const transcript = Array.from(event.results)
                .map(result => result[0].transcript)
                .join('');
            
            document.getElementById('chatInput').value = transcript;
            autoResizeTextArea(document.getElementById('chatInput'));
        };

        recognition.start();
        updateState({ recognition, isRecording: true });
        micBtn.classList.add('active');
    } else {
        // Stop recording
        state.recognition.stop();
        updateState({ isRecording: false });
        micBtn.classList.remove('active');
    }
}

export async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    toggleLoadingSpinner(true);

    try {
        // Upload image and process medication info
        const response = await callCloudFunction('processMedicationImage', formData);
        
        // Add image preview to chat
        const imageMessage = `<img src="${URL.createObjectURL(file)}" alt="Medication Image">`;
        addMessageToChat('user', imageMessage);
        
        // Add extracted information
        addMessageToChat('bot', response.medicationInfo);
        
        // Update completion status
        updateCompletionStatus(response.completedSections);
    } catch (error) {
        console.error('Error processing image:', error);
        addMessageToChat('bot', 'Sorry, there was an error processing your image. Please try again.');
    }

    toggleLoadingSpinner(false);
}

export async function generateDemoAnswers() {
    toggleLoadingSpinner(true);

    try {
        const response = await callCloudFunction('generateDemoAnswers');
        
        // Process each demo answer
        for (const answer of response.answers) {
            addMessageToChat('user', answer.question);
            addMessageToChat('bot', answer.response);
            await new Promise(resolve => setTimeout(resolve, 500)); // Add delay between messages
        }
        
        updateCompletionStatus(response.completedSections);
    } catch (error) {
        console.error('Error generating demo answers:', error);
        addMessageToChat('bot', 'Sorry, there was an error generating demo answers. Please try again.');
    }

    toggleLoadingSpinner(false);
}

export async function downloadPatientRecord() {
    toggleLoadingSpinner(true);

    try {
        const response = await callCloudFunction('downloadPdf', { currentRecord: state.currentRecord });
        
        // Create a Blob from the PDF Stream
        const file = new Blob([response.pdfBuffer], { type: 'application/pdf' });
        
        // Create a link element, hide it, direct it towards the blob, and then 'click' it programatically
        const a = document.createElement("a");
        a.style = "display: none";
        document.body.appendChild(a);
        
        // Create a DOMString representing the blob and point the link element towards it
        const url = window.URL.createObjectURL(file);
        a.href = url;
        a.download = 'patient_record.pdf';
        
        // Programatically click the link to trigger the download
        a.click();
        
        // Release the reference to the file by revoking the Object URL
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error downloading PDF:', error);
        alert('Sorry, there was an error downloading the PDF. Please try again.');
    }

    toggleLoadingSpinner(false);
}
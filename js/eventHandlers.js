import { state, updateState } from './state.js';
import { updateProgressItems, updateCompletionStatus, addMessageToChat, toggleLoadingSpinner, handleTabChange } from './ui.js';
import { callCloudFunction, uploadMedicationImage } from './api.js';
import { autoResizeTextArea, sanitizeString } from './utils.js';

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

    addMessageToChat('user', message);
    chatInput.value = '';
    autoResizeTextArea(chatInput);
    toggleLoadingSpinner(true);

    try {
        const response = await callCloudFunction('processMessage', {
            userMessage: message,
            currentRecord: state.currentRecord,
            currentPrompt: state.currentPrompt
        });
        
        console.log("Full response from backend:", response);

        if (response.updated_record) {
            updateState({ currentRecord: { ...state.currentRecord, ...response.updated_record } });
        }
        
        if (Array.isArray(response.completedSections) && response.completedSections.length > 0) {
            console.log("Completed sections:", response.completedSections);
            updateCompletionStatus(response.completedSections);
            // Note: updateCompletionStatus now handles both UI updates and state management
        } else {
            console.log("No new sections completed in this update");
        }
        
        let botMessage = '';
        if (response.message) {
            botMessage = response.message;
        } else if (response.next_prompt && response.next_prompt.prompt) {
            botMessage = response.next_prompt.prompt;
        }

        if (botMessage) {
            addMessageToChat('bot', formatBotMessage(botMessage));
        }

        if (response.next_prompt) {
            updateState({ currentPrompt: response.next_prompt });
        }

        if (response.ready_to_insert) {
            console.log("All required information collected. Ready to insert into database.");
            // Trigger action for completed form (e.g., switch to summary tab)
        }

    } catch (error) {
        console.error('Error processing message:', error);
        console.error('Error stack:', error.stack);
        addMessageToChat('bot', 'Sorry, there was an error processing your message. Please try again.');
    } finally {
        console.log("Current record:", JSON.stringify(state.currentRecord, null, 2));
        toggleLoadingSpinner(false);
    }
}

function formatBotMessage(message) {
    const lines = message.split('\n');
    
    const formattedLines = lines.map(line => {
        line = sanitizeString(line);
        
        if (line.trim().endsWith('?')) {
            return `<strong>${line}</strong>`;
        }
        
        if (line.trim().startsWith('-')) {
            return `<li>${line.trim().substring(1).trim()}</li>`;
        }
        
        return line;
    });

    let formattedMessage = '';
    let inList = false;
    formattedLines.forEach(line => {
        if (line.startsWith('<li>') && !inList) {
            formattedMessage += '<ul>';
            inList = true;
        } else if (!line.startsWith('<li>') && inList) {
            formattedMessage += '</ul>';
            inList = false;
        }
        formattedMessage += line;
    });
    if (inList) {
        formattedMessage += '</ul>';
    }

    return formattedMessage;
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

    toggleLoadingSpinner(true);

    try {
        // Upload image and process medication info
        const response = await uploadMedicationImage(file);
        
        // Add image preview to chat
        const imageMessage = `<img src="${URL.createObjectURL(file)}" alt="Medication Image" class="chat-image">`;
        addMessageToChat('user', imageMessage);
        
        // Add extracted information
        if (response.medicationInfo) {
            addMessageToChat('bot', response.medicationInfo);
        }
        
        // Update completion status if provided
        if (response.completedSections) {
            console.log("Completed sections:", response.completedSections);
            updateCompletionStatus(response.completedSections);
            updateCompletedSections(response.completedSections);
            updateProgressItems();  // Add this line if it's not already there
        }

        // Update current record if provided
        if (response.updated_record) {
            updateState({ currentRecord: { ...state.currentRecord, ...response.updated_record } });
        }

        // Update tooltips
        updateProgressItems();

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
        
        if (response.completedSections) {
            console.log("Completed sections:", response.completedSections);
            updateCompletionStatus(response.completedSections);
            updateCompletedSections(response.completedSections);
            updateProgressItems();  // Add this line if it's not already there
        }

        if (response.updated_record) {
            updateState({ currentRecord: { ...state.currentRecord, ...response.updated_record } });
        }

        // Update tooltips
        updateProgressItems();

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
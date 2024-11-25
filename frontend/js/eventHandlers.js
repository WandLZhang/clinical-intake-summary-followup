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

    // New event listeners for Doctor Summary tab
    document.getElementById('qaSubmit').addEventListener('click', handleQASubmit);
    document.getElementById('qaInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleQASubmit();
        }
    });
    document.getElementById('generateRecommendations').addEventListener('click', handleGenerateRecommendations);

    //Patient look up
    document.getElementById('patientLookupBtn').addEventListener('click', handlePatientLookup);
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
            updateProgressItems(); 
        }
        
        if (Array.isArray(response.completedSections) && response.completedSections.length > 0) {
            console.log("Completed sections:", response.completedSections);
            updateCompletionStatus(response.completedSections);
            updateProgressItems();
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
        
        if (response.medicationInfo) {
            // Add the raw medication information to the chat input
            const chatInput = document.getElementById('chatInput');
            chatInput.value += (chatInput.value ? '\n\n' : '') + response.medicationInfo;
            autoResizeTextArea(chatInput);
            
            addMessageToChat('bot', "I've extracted medication information from the image. Please review the information in the chat input, make any necessary corrections, and send the message when you're ready.");
        } else {
            addMessageToChat('bot', "I couldn't extract any medication information from the image. Could you please type your medications and dosages in the chat input?");
        }
    } catch (error) {
        console.error('Error processing image:', error);
        addMessageToChat('bot', 'Sorry, there was an error processing your image. Could you please type out your medications and dosages?');
    }
    
    // Reset the file input to allow uploading the same file again
    event.target.value = '';

    toggleLoadingSpinner(false);
}


export async function generateDemoAnswers() {
    toggleLoadingSpinner(true);

    try {
        const response = await fetch('example_narrative.txt');
        const text = await response.text();
        
        const chatInput = document.getElementById('chatInput');
        chatInput.value = text;
        autoResizeTextArea(chatInput);
        
        // Trigger the input event to update any listeners
        const event = new Event('input', { bubbles: true });
        chatInput.dispatchEvent(event);

    } catch (error) {
        console.error('Error generating demo answers:', error);
        addMessageToChat('bot', 'Sorry, there was an error generating demo answers. Please try again.');
    }

    toggleLoadingSpinner(false);
}

function generatePrintableHTML(record) {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Patient Record</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                h1 { color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px; }
                h2 { color: #1d4ed8; margin-top: 20px; }
                .section { margin-bottom: 30px; }
                .subsection { margin-left: 20px; }
                @media print {
                    body { font-size: 12pt; }
                    h1 { font-size: 18pt; }
                    h2 { font-size: 16pt; }
                }
            </style>
        </head>
        <body>
            <h1>Patient Record</h1>
            
            <div class="section">
                <h2>Symptoms</h2>
                <div class="subsection">
                    <h3>Current Symptoms</h3>
                    <p>${Object.keys(record.symptoms.current).filter(key => record.symptoms.current[key]).join(', ') || 'None reported'}</p>
                    
                    <h3>Blood Sugar</h3>
                    <p>Check Frequency: ${record.symptoms.blood_sugar.check_frequency || 'Not provided'}</p>
                    <p>Fasting Range: ${record.symptoms.blood_sugar.fasting_range || 'Not provided'}</p>
                    <p>Post-meal Range: ${record.symptoms.blood_sugar.post_meal_range || 'Not provided'}</p>
                    
                    <h3>Medications</h3>
                    <ul>
                        ${record.symptoms.medications.medication_list.map(med => `<li>${med.name} (${med.dosage})</li>`).join('')}
                    </ul>
                    <p>Adherence: ${record.symptoms.medications.adherence || 'Not provided'}</p>
                    <p>Problems: ${record.symptoms.medications.problems || 'None reported'}</p>
                </div>
            </div>
            
            <div class="section">
                <h2>Lifestyle</h2>
                <div class="subsection">
                    <h3>Diet</h3>
                    <p>Description: ${record.lifestyle.diet.description || 'Not provided'}</p>
                    <p>Fruits and Vegetables: ${record.lifestyle.diet.fruits_vegetables_frequency || 'Not provided'}</p>
                    
                    <h3>Physical Activity</h3>
                    <p>Frequency: ${record.lifestyle.activity.frequency || 'Not provided'}</p>
                    
                    <h3>Mental Health</h3>
                    <p>${Object.keys(record.lifestyle.mental.symptoms).filter(key => record.lifestyle.mental.symptoms[key]).join(', ') || 'No issues reported'}</p>
                    
                    <h3>Cognitive Function</h3>
                    <p>${record.lifestyle.cognitive.status || 'Not provided'}</p>
                </div>
            </div>
            
            <div class="section">
                <h2>Additional Information</h2>
                <div class="subsection">
                    <h3>Other Conditions</h3>
                    <p>${Object.keys(record.additional.conditions).join(', ') || 'None reported'}</p>
                    
                    <h3>Healthcare Provider</h3>
                    <p>Name: ${record.additional.healthcare.provider_name || 'Not provided'}</p>
                    <p>Last Visit: ${record.additional.healthcare.last_visit || 'Not provided'}</p>
                    
                    <h3>Additional Concerns</h3>
                    <p>${record.additional.concerns || 'None reported'}</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

export function downloadPatientRecord() {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(generatePrintableHTML(state.currentRecord));
    printWindow.document.close();
    printWindow.focus();

    // Wait for content to load before printing
    printWindow.onload = function() {
        printWindow.print();
        printWindow.onafterprint = function() {
            printWindow.close();
        };
    };
}

async function handleQASubmit() {
    const qaInput = document.getElementById('qaInput');
    const question = qaInput.value.trim();

    if (!question) return;

    const qaContent = document.getElementById('qa-content');
    qaContent.innerHTML += marked.parse(`**Q:** ${sanitizeString(question)}\n\n`);
    qaInput.value = '';

    toggleLoadingSpinner(true);
    try {
        const response = await callCloudFunction('doctorSummaryAndQA', { 
            action: 'question',
            question: question,
            currentRecord: state.currentRecord 
        });
        qaContent.innerHTML += marked.parse(`**A:** ${sanitizeString(response.answer)}\n\n`);
    } catch (error) {
        console.error('Error getting answer:', error);
        qaContent.innerHTML += marked.parse(`**A:** Sorry, there was an error processing your question. Please try again.\n\n`);
    }
    toggleLoadingSpinner(false);
    qaContent.scrollTop = qaContent.scrollHeight;
}

async function handleGenerateRecommendations() {
    toggleLoadingSpinner(true);
    const recommendationsContent = document.getElementById('recommendationsContent');

    if (recommendationsContent.innerHTML.trim() === '') {
        recommendationsContent.innerHTML = '<p><strong>Loading...</strong></p>';
    }

    try {
      const response = await callCloudFunction('generateRecommendations', { patientRecord: state.currentRecord });
      const { recommendations, documents } = response;
      
      // Display retrieved documents
      const documentsHtml = documents.map((doc, index) => `
        <div class="mb-4 p-4 bg-gray-100 rounded">
          <h4 class="font-semibold text-lg">${doc.title}</h4>
          <p class="abstract-content">${doc.content.substring(0, 200)}...</p>
          <button class="read-more-btn text-blue-500 hover:text-blue-700" data-index="${index}">Read more</button>
          <div class="full-abstract hidden">${doc.content}</div>
        </div>
      `).join('');
      
      recommendationsContent.innerHTML = `
        <div class="mb-6">
          <h3 class="text-xl font-semibold mb-2">Retrieved Documents</h3>
          ${documentsHtml}
        </div>
        <div>
          <h3 class="text-xl font-semibold mb-2">Recommendations</h3>
          <div id="markdown-content"></div>
        </div>
      `;
  
      // Render markdown content
      document.getElementById('markdown-content').innerHTML = marked.parse(recommendations);
  
      // Add event listeners for "Read more" buttons
      document.querySelectorAll('.read-more-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          const index = this.getAttribute('data-index');
          const abstractContent = this.previousElementSibling;
          const fullAbstract = this.nextElementSibling;
          
          if (this.textContent === 'Read more') {
            abstractContent.classList.add('hidden');
            fullAbstract.classList.remove('hidden');
            this.textContent = 'Read less';
          } else {
            abstractContent.classList.remove('hidden');
            fullAbstract.classList.add('hidden');
            this.textContent = 'Read more';
          }
        });
      });
  
    } catch (error) {
      console.error('Error generating recommendations:', error);
      recommendationsContent.innerHTML = 'Error generating recommendations. Please try again.';
    }
    toggleLoadingSpinner(false);
  }

  export async function handlePatientLookup() {
    const patientId = document.getElementById('patientIdInput').value.trim();
    if (!patientId) {
        alert('Please enter a valid Patient ID');
        return;
    }

    try {
        toggleLoadingSpinner(true);
        const medications = await callCloudFunction('queryPatientMedications', { patientId });
        if (medications) {
            const message = `Patient ${patientId} is taking the following medications: ${medications}`;
            await handleMessageSend(message);
        } else {
            alert('No medications found for this patient');
        }
    } catch (error) {
        console.error('Error looking up patient medications:', error);
        alert('Error looking up patient medications. Please try again.');
    } finally {
        toggleLoadingSpinner(false);
    }
}

export async function handlePatientLookup() {
    const patientId = document.getElementById('patientIdInput').value.trim();
    if (!patientId) {
        alert('Please enter a valid Patient ID');
        return;
    }

    try {
        toggleLoadingSpinner(true);
        const response = await callCloudFunction('queryPatientMedications', { patientId });
        
        if (response && response.medications) {
            const message = `Patient ${patientId} is taking the following medications: ${response.medications}`;
            
            // Simulate user input by setting the chat input value
            const chatInput = document.getElementById('chatInput');
            chatInput.value = message;
            
            // Trigger the handleMessageSend function
            handleMessageSend();
        } else {
            alert('No medications found for this patient');
        }
    } catch (error) {
        console.error('Error looking up patient medications:', error);
        alert('Error looking up patient medications. Please try again.');
    } finally {
        toggleLoadingSpinner(false);
    }
}

// state.js

export const state = {
    currentTab: 'intake',
    completedSections: new Set(),
    chatHistory: [],
    currentRecord: {
        symptoms: {
            current: {},
            blood_sugar: {},
            medications: {
                medication_list: []
            }
        },
        lifestyle: {
            diet: {},
            activity: {},
            mental: {
                symptoms: {}
            },
            cognitive: {}
        },
        additional: {
            conditions: {},
            healthcare: {},
            concerns: ''
        }
    },
    currentPrompt: null,
    isRecording: false,
};

export function updateState(updates) {
    Object.assign(state, updates);
}

export function updateCompletedSections(completedSections) {
    if (Array.isArray(completedSections)) {
        state.completedSections = new Set([...state.completedSections, ...completedSections]);
    } else {
        console.error('Invalid completedSections data:', completedSections);
    }
}

export function isWholeSectionCompleted(section) {
    const subsections = [
        'current', 'blood_sugar', 'medications', 'problems',
        'diet', 'activity', 'mental', 'cognitive',
        'conditions', 'healthcare', 'concerns'
    ];
    return subsections.every(subsection => state.completedSections.has(`${section}-${subsection}`));
}

export function resetState() {
    state.currentTab = 'intake';
    state.completedSections.clear();
    state.chatHistory = [];
    state.currentRecord = {
        symptoms: {
            current: {},
            blood_sugar: {},
            medications: {
                medication_list: []
            }
        },
        lifestyle: {
            diet: {},
            activity: {},
            mental: {
                symptoms: {}
            },
            cognitive: {}
        },
        additional: {
            conditions: {},
            healthcare: {},
            concerns: ''
        }
    };
    state.currentPrompt = null;
    state.isRecording = false;
}

export function addToChatHistory(message, sender) {
    state.chatHistory.push({ message, sender, timestamp: new Date() });
}

export function updateCurrentRecord(updates) {
    state.currentRecord = { ...state.currentRecord, ...updates };
}

export function setCurrentPrompt(prompt) {
    state.currentPrompt = prompt;
}

export function toggleRecording() {
    state.isRecording = !state.isRecording;
}
export const state = {
    currentTab: 'intake',
    completedSections: {
        symptoms: new Set(),
        lifestyle: new Set(),
        additional: new Set()
    },
    chatHistory: [],
    currentRecord: {},
    isRecording: false,
};

export function updateState(updates) {
    Object.assign(state, updates);
}
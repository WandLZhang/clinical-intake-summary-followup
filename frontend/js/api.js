// Define the base URL for your cloud functions
const BASE_URL = 'https://us-central1-gemini-med-lit-review.cloudfunctions.net';

// Define endpoints for each cloud function
const endpoints = {
    'processMessage': `${BASE_URL}/dha-processMessage`,
    'generateRecommendations': `${BASE_URL}/dha-generateRecommendations`,
    'generateFollowUp': `${BASE_URL}/dha-generateFollowUp`,
    'processMedicationImage': `${BASE_URL}/dha-processMedicationImage`,
    'doctorSummaryAndQA': `${BASE_URL}/dha-doctorSummaryAndQA`,
    'queryPatientMedications': `${BASE_URL}/dha-queryPatientMedications`
};

/**
 * Calls a cloud function with the given name and data.
 * 
 * @param {string} functionName - The name of the cloud function to call.
 * @param {Object} data - The data to send to the cloud function.
 * @returns {Promise<Object>} - The response from the cloud function.
 * @throws {Error} - If the function name is unknown or if there's an error calling the function.
 */
export async function callCloudFunction(functionName, data = {}) {
    const endpoint = endpoints[functionName];
    if (!endpoint) {
        throw new Error(`Unknown function: ${functionName}`);
    }

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`Error calling ${functionName}:`, error);
        throw error;
    }
}

/**
 * Uploads an image file to process medication information.
 * 
 * @param {File} file - The image file to upload.
 * @returns {Promise<Object>} - The response from the cloud function.
 * @throws {Error} - If there's an error uploading the image.
 */
export async function uploadMedicationImage(file) {
    const formData = new FormData();
    formData.append('image', file);

    try {
        const response = await fetch(endpoints.processMedicationImage, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error uploading medication image:', error);
        throw error;
    }
}
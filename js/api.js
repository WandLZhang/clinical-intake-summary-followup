// Define the base URL for your cloud functions
const BASE_URL = 'https://us-central1-gemini-med-lit-review.cloudfunctions.net';

// Define endpoints for each cloud function
const endpoints = {
    'processMessage': `${BASE_URL}/dha-processMessage`,
    'generateDemoAnswers': `${BASE_URL}/dha-generateDemo`,
    'generateDoctorSummary': `${BASE_URL}/dha-doctorSummary`,
    'askQuestions': `${BASE_URL}/dha-askQuestions`,
    'generateRecommendations': `${BASE_URL}/dha-generateRecommendations`,
    'generateFollowUp': `${BASE_URL}/dha-generateFollowUp`,
    'downloadPdf': `${BASE_URL}/dha-downloadPdf`,
    'processMedicationImage': `${BASE_URL}/dha-processMedicationImage`
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

/**
 * Downloads the patient record as a PDF.
 * 
 * @param {Object} currentRecord - The current patient record.
 * @returns {Promise<Blob>} - A Blob containing the PDF data.
 * @throws {Error} - If there's an error downloading the PDF.
 */
export async function downloadPatientRecordPdf(currentRecord) {
    try {
        const response = await fetch(endpoints.downloadPdf, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ currentRecord })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.blob();
    } catch (error) {
        console.error('Error downloading PDF:', error);
        throw error;
    }
}
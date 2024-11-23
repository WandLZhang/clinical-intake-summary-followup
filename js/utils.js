import { state } from './state.js';

/**
 * Automatically resizes a textarea based on its content.
 * 
 * @param {HTMLTextAreaElement} textarea - The textarea element to resize.
 */
export function autoResizeTextArea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
}

/**
 * Generates tooltip content based on the category and subcategory.
 * 
 * @param {string} category - The main category of the progress item.
 * @param {string} subcategory - The subcategory of the progress item.
 * @returns {string} - The tooltip content.
 */
export function getTooltipContent(category, subcategory) {
    //console.log(`getTooltipContent called with category: ${category}, subcategory: ${subcategory}`);
    if (category === 'symptoms' && subcategory === 'blood') {
        subcategory = 'blood-sugar';
    }
    
    const record = state.currentRecord[category];
    if (!record) return 'Not completed';

    let content = '';
    switch (`${category}-${subcategory}`) {
        case 'symptoms-current':
            content = Object.entries(record.current || {})
                .filter(([key, value]) => value === true)
                .map(([key]) => key.replace(/_/g, ' '))
                .join(', ');
            return content ? `Current symptoms: ${content}` : 'No current symptoms reported';
        case 'symptoms-blood-sugar':
            console.log('Matched symptoms-blood-sugar case');
            if (record.blood_sugar) {
                const bs = record.blood_sugar;
                const parts = [];
                if (bs.check_frequency) parts.push(`Check frequency: ${bs.check_frequency}`);
                if (bs.fasting_range) parts.push(`Fasting range: ${bs.fasting_range}`);
                if (bs.post_meal_range) parts.push(`Post-meal range: ${bs.post_meal_range}`);
                return parts.length ? parts.join(', ') : 'Partial blood sugar information available';
            }
            return 'Blood sugar information not provided';
        case 'symptoms-medications':
            return record.medications && record.medications.medication_list ? `Medications: ${record.medications.medication_list.join(', ')}` : 'No medications reported';
        case 'symptoms-problems':
            return record.medications && record.medications.problems ? `Medication issues: ${record.medications.problems.description}` : 'No medication issues reported';
        case 'lifestyle-diet':
            return record.diet ? `Overall health: ${record.diet.overall_health}, Fruits/Vegetables: ${record.diet.fruits_vegetables_frequency}` : 'Diet information not provided';
        case 'lifestyle-activity':
            return record.activity ? `Exercise frequency: ${record.activity.exercise_frequency}` : 'Physical activity information not provided';
        case 'lifestyle-mental':
            content = record.mental && record.mental.symptoms ? Object.entries(record.mental.symptoms)
                .filter(([key, value]) => value === true)
                .map(([key]) => key.replace(/_/g, ' '))
                .join(', ') : '';
            return content ? `Mental health symptoms: ${content}` : 'No mental health symptoms reported';
        case 'lifestyle-cognitive':
            return record.cognitive && record.cognitive.description ? `Cognitive changes: ${record.cognitive.description}` : 'No cognitive changes reported';
        case 'additional-conditions':
            return record.conditions && record.conditions.description ? `Other conditions: ${record.conditions.description}` : 'No additional conditions reported';
        case 'additional-healthcare':
            return record.healthcare && record.healthcare.provider_details ? `Healthcare provider: ${record.healthcare.provider_details}` : 'No healthcare provider information';
        case 'additional-concerns':
            return record.concerns ? `Concerns: ${record.concerns}` : 'No additional concerns reported';
        default:
            return 'Information not available';
    }
}

/**
 * Formats a date object to a string in the format "YYYY-MM-DD".
 * 
 * @param {Date} date - The date to format.
 * @returns {string} - The formatted date string.
 */
export function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Debounces a function call.
 * 
 * @param {Function} func - The function to debounce.
 * @param {number} wait - The number of milliseconds to delay.
 * @returns {Function} - The debounced function.
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Capitalizes the first letter of each word in a string.
 * 
 * @param {string} str - The string to capitalize.
 * @returns {string} - The capitalized string.
 */
export function capitalizeWords(str) {
    return str.replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Sanitizes a string by removing or replacing potentially harmful characters.
 * 
 * @param {string} str - The string to sanitize.
 * @returns {string} - The sanitized string.
 */
export function sanitizeString(str) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        "/": '&#x2F;',
    };
    const reg = /[&<>"'/]/ig;
    return str.replace(reg, (match)=>(map[match]));
}

/**
 * Checks if a string is a valid email address.
 * 
 * @param {string} email - The email address to validate.
 * @returns {boolean} - True if the email is valid, false otherwise.
 */
export function isValidEmail(email) {
    const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
}

/**
 * Generates a unique ID.
 * 
 * @returns {string} - A unique ID.
 */
export function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
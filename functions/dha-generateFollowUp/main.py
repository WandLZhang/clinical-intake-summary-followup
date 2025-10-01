from google import genai
from google.genai import types
import functions_framework
from flask import jsonify, request
import json
import logging
import os

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Gemini client
client = genai.Client(
    vertexai=True,
    project="gemini-med-lit-review",
    location="us-central1",
)

model = "gemini-2.5-pro"

generate_content_config = types.GenerateContentConfig(
    temperature=0.7,
    top_p=0.95,
    max_output_tokens=8192,
    safety_settings=[
        types.SafetySetting(
            category="HARM_CATEGORY_HATE_SPEECH",
            threshold="OFF"
        ),
        types.SafetySetting(
            category="HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold="OFF"
        ),
        types.SafetySetting(
            category="HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold="OFF"
        ),
        types.SafetySetting(
            category="HARM_CATEGORY_HARASSMENT",
            threshold="OFF"
        )
    ],
)

def generate_follow_up_letter(patient_record, recommendations=None):
    if not recommendations:
        rec_prompt = f"""
        Based on the following patient record, generate 3-5 medically sound recommendations:
        {json.dumps(patient_record, indent=2)}
        
        Provide the recommendations in a list format.
        """
        
        rec_contents = [
            types.Content(
                role="user",
                parts=[types.Part(text=rec_prompt)]
            )
        ]
        
        rec_response = client.models.generate_content(
            model=model,
            contents=rec_contents,
            config=generate_content_config,
        )
        recommendations = rec_response.text

    prompt = f"""
    You are a caring and professional physician. Generate a follow-up letter for a patient based on their medical record and recommendations. The letter should be pleasant, informative, and mention any referrals or actions the facility will handle for the patient.

    Patient Record:
    {json.dumps(patient_record, indent=2)}

    Recommendations:
    {recommendations}

    Please write a follow-up letter that includes:
    1. A warm greeting
    2. A summary of the visit and findings
    3. Explanation of the recommendations
    4. Any referrals or actions the facility will take (you can make these up as needed for demonstration purposes)
    5. Encouragement for the patient to follow the plan
    6. An invitation to reach out with any questions
    7. A polite closing

    Structure the letter using semantic HTML elements and include the following CSS classes for styling:
    - Use <h1> for the main title with class "text-2xl font-bold mb-4"
    - Use <p> tags for paragraphs with class "mb-4"
    - Use <ul> for unordered lists with class "list-disc list-inside mb-4"
    - Use <li> for list items
    - Wrap the entire content in a <div> with class "follow-up-letter"
    """

    contents = [
        types.Content(
            role="user",
            parts=[types.Part(text=prompt)]
        )
    ]

    generated_letter = ""
    for chunk in client.models.generate_content_stream(
        model=model,
        contents=contents,
        config=generate_content_config,
    ):
        generated_letter += chunk.text

    return generated_letter

@functions_framework.http
def generate_follow_up_letter_http(request):
    """HTTP Cloud Function for generating follow-up letters."""
    # Handle CORS preflight request
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '3600'
        }
        return ('', 204, headers)

    # Set CORS headers for the main request
    headers = {
        'Access-Control-Allow-Origin': '*'
    }

    try:
        request_json = request.get_json(silent=True)
        if not request_json:
            return jsonify({"error": "No JSON data provided"}), 400, headers

        patient_record = request_json.get('patientRecord')
        recommendations = request_json.get('recommendations', '')

        if not patient_record:
            return jsonify({'error': 'Missing patient record'}), 400, headers

        follow_up_letter = generate_follow_up_letter(patient_record, recommendations)
        
        return jsonify({
            "letter": follow_up_letter
        }), 200, headers

    except Exception as e:
        logger.error(f"Error generating follow-up letter: {str(e)}")
        return jsonify({
            "error": "An unexpected error occurred. Please try again later."
        }), 500, headers

if __name__ == "__main__":
    # For local testing
    test_patient_record = {
        "name": "John Doe",
        "age": 45,
        "diagnosis": "Type 2 Diabetes",
        "symptoms": {
            "blood_sugar": {
                "fasting_range": "140-180 mg/dL",
                "post_meal_range": "200-250 mg/dL"
            }
        },
        "lifestyle": {
            "diet": "Inconsistent, often high in carbohydrates",
            "activity": "Sedentary"
        }
    }
    print(generate_follow_up_letter(test_patient_record))

from google import genai
from google.genai import types
import functions_framework
from flask import jsonify, request
import os

# Initialize Gemini client
client = genai.Client(
    vertexai=True,
    project="gemini-med-lit-review",
    location="us-central1",
)

model = "gemini-2.5-pro"

textsi_1 = """You are a helpful and friendly medical assistant AI. Your purpose is to assist healthcare professionals by providing summaries of patient records and answering medical questions. Always prioritize patient safety and refer to the most up-to-date medical guidelines. If you're unsure about any information, clearly state that and suggest consulting with a specialist or referring to recent medical literature."""

generate_content_config = types.GenerateContentConfig(
    temperature=0.9,
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
    system_instruction=textsi_1,
)

def doctor_summary_and_qa(action, current_record, question=None):
    if action == 'summary':
        prompt = f"""Based on the following patient record, provide a concise summary in bulleted form for a physician, highlighting the most important diabetes indicators and current medications:

        {current_record}

        Focus on key diabetes management metrics, recent changes, and any areas of concern."""

    elif action == 'question':
        prompt = f"""Given the following patient record and the physician's question, provide a medically sound answer:

        Patient Record:
        {current_record}

        Physician's Question: {question}

        Provide a clear, concise answer based on the patient's information and general medical knowledge, in bullets. If the answer cannot be directly inferred from the patient record, state that clearly and provide general medical guidance."""

    else:
        raise ValueError("Invalid action specified")

    contents = [
        types.Content(
            role="user",
            parts=[types.Part(text=prompt)]
        )
    ]

    response = client.models.generate_content(
        model=model,
        contents=contents,
        config=generate_content_config,
    )
    
    return response.text

@functions_framework.http
def doctor_summary_and_qa_http(request):
    """HTTP Cloud Function."""
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
        data = request.get_json()
        action = data.get('action')
        current_record = data.get('currentRecord')
        question = data.get('question')

        if not action or not current_record:
            return jsonify({'error': 'Missing required parameters'}), 400, headers

        result = doctor_summary_and_qa(action, current_record, question)

        if action == 'summary':
            return jsonify({'summary': result}), 200, headers
        elif action == 'question':
            return jsonify({'answer': result}), 200, headers

    except Exception as e:
        return jsonify({'error': str(e)}), 500, headers

if __name__ == "__main__":
    # For local testing
    test_record = """
    Patient: John Doe
    Age: 45
    Diagnosis: Type 2 Diabetes
    Current HbA1c: 7.8%
    Medications: Metformin 1000mg twice daily, Gliclazide 80mg daily
    """
    print("Summary:")
    print(doctor_summary_and_qa('summary', test_record))
    print("\nQ&A:")
    print(doctor_summary_and_qa('question', test_record, "What changes to medication might be considered given the current HbA1c?"))

import vertexai
from vertexai.generative_models import GenerativeModel, SafetySetting
import functions_framework
from flask import jsonify, request

# Initialize Vertex AI
vertexai.init(project="gemini-med-lit-review", location="us-central1")

textsi_1 = """You are a helpful and friendly medical assistant AI. Your purpose is to assist healthcare professionals by providing summaries of patient records and answering medical questions. Always prioritize patient safety and refer to the most up-to-date medical guidelines. If you're unsure about any information, clearly state that and suggest consulting with a specialist or referring to recent medical literature."""

generation_config = {
    "max_output_tokens": 8192,
    "temperature": 0.9,
    "top_p": 0.95,
}

safety_settings = [
    SafetySetting(
        category=SafetySetting.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold=SafetySetting.HarmBlockThreshold.OFF
    ),
    SafetySetting(
        category=SafetySetting.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold=SafetySetting.HarmBlockThreshold.OFF
    ),
    SafetySetting(
        category=SafetySetting.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold=SafetySetting.HarmBlockThreshold.OFF
    ),
    SafetySetting(
        category=SafetySetting.HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold=SafetySetting.HarmBlockThreshold.OFF
    ),
]

def doctor_summary_and_qa(action, current_record, question=None):
    model = GenerativeModel(
        "gemini-1.5-flash-002",
        generation_config=generation_config,
        safety_settings=safety_settings
    )

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

    response = model.generate_content(prompt)
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
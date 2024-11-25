import base64
import json
import functions_framework
import vertexai
from vertexai.generative_models import GenerativeModel, Part, SafetySetting

@functions_framework.http
def process_medication_image(request):
    print("Function started")
    # Set CORS headers for the preflight request
    if request.method == 'OPTIONS':
        print("Handling OPTIONS request")
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '3600'
        }
        return ('', 204, headers)

    # Set CORS headers for the main request
    headers = {
        'Access-Control-Allow-Origin': '*'
    }

    try:
        print("Processing main request")
        # Get the image file from the request
        if 'image' not in request.files:
            print("No image file in request")
            return ('No image file uploaded', 400, headers)

        image_file = request.files['image']
        print(f"Image file received: {image_file.filename}")
        image_data = image_file.read()
        print(f"Image data length: {len(image_data)} bytes")

        # Initialize Vertex AI
        print("Initializing Vertex AI")
        vertexai.init(project="gemini-med-lit-review", location="us-central1")
        model = GenerativeModel("gemini-1.5-flash-002")

        # Prepare the image for the model
        print("Preparing image for model")
        image_part = Part.from_data(mime_type=image_file.content_type, data=image_data)

        # Generate content
        print("Generating content")
        response = model.generate_content(
            [image_part, "Extract all relevant medication information from this image. Include names, dosages, total volumes, and any other pertinent details. Provide the information in a structured format."],
            generation_config={
                "max_output_tokens": 8192,
                "temperature": 0.4,
                "top_p": 0.95,
            },
            safety_settings=[
                SafetySetting(category=SafetySetting.HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold=SafetySetting.HarmBlockThreshold.OFF),
                SafetySetting(category=SafetySetting.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold=SafetySetting.HarmBlockThreshold.OFF),
                SafetySetting(category=SafetySetting.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold=SafetySetting.HarmBlockThreshold.OFF),
                SafetySetting(category=SafetySetting.HarmCategory.HARM_CATEGORY_HARASSMENT, threshold=SafetySetting.HarmBlockThreshold.OFF),
            ]
        )

        # Process the response
        print("Processing response")
        print(f"Raw response: {response.text}")

        # Prepare the response
        result = {
            'medicationInfo': response.text,
            'message': 'Medication information extracted successfully'
        }

        print("Returning successful response")
        return (json.dumps(result), 200, headers)

    except Exception as e:
        print(f"Error occurred: {str(e)}")
        print(f"Error type: {type(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return (json.dumps({'error': str(e)}), 500, headers)

import base64
import json
import functions_framework
from google import genai
from google.genai import types
import os

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

        # Initialize Gemini client
        print("Initializing Gemini client")
        client = genai.Client(
            vertexai=True,
            project="gemini-med-lit-review",
            location="us-central1",
        )
        
        model = "gemini-2.5-pro"

        # Prepare the image for the model
        print("Preparing image for model")
        image_part = types.Part.from_bytes(
            data=image_data,
            mime_type=image_file.content_type
        )

        # Generate content
        print("Generating content")
        contents = [
            types.Content(
                role="user",
                parts=[
                    image_part,
                    types.Part.from_text("Extract all relevant medication information from this image. Include names, dosages, total volumes, and any other pertinent details. Provide the information in a structured format.")
                ]
            )
        ]
        
        generate_content_config = types.GenerateContentConfig(
            temperature=0.4,
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
        
        response = client.models.generate_content(
            model=model,
            contents=contents,
            config=generate_content_config,
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

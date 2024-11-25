import functions_framework
from flask import jsonify
from flask_cors import CORS
import json
import logging
import traceback
import vertexai
from vertexai.generative_models import GenerativeModel, Part, SafetySetting
from typing import Dict, Any, List, Optional, Tuple

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Vertex AI
vertexai.init(project="gemini-med-lit-review", location="us-central1")

# Define the record schema
RECORD_SCHEMA: Dict[str, Any] = {
    "symptoms": {
        "current": {
            "increased_thirst": False,
            "frequent_urination": False,
            "unexplained_weight_loss": False,
            "increased_hunger": False,
            "blurred_vision": False,
            "slow_healing_sores": False,
            "frequent_infections": False,
            "numbness_tingling": False,
            "fatigue": False,
            "other_symptoms": ""
        },
        "blood_sugar": {
            "check_frequency": "",
            "fasting_range": "",
            "post_meal_range": ""
        },
        "medications": {
            "taking_medications": False,
            "medication_list": [],
            "adherence": "",
            "problems": {
                "has_problems": False,
                "description": ""
            }
        }
    },
    "lifestyle": {
        "diet": {
            "overall_health": "",
            "fruits_vegetables_frequency": ""
        },
        "activity": {
            "exercise_frequency": ""
        },
        "mental": {
            "stress_level": "",
            "symptoms": {
                "loss_of_interest": False,
                "depression": False,
                "difficulty_concentrating": False,
                "appetite_changes": False,
                "sleep_problems": False,
                "hopelessness": False,
                "suicidal_thoughts": False,
                "other": ""
            }
        },
        "cognitive": {
            "has_changes": False,
            "description": ""
        }
    },
    "additional": {
        "conditions": {
            "has_conditions": False,
            "description": ""
        },
        "healthcare": {
            "seeing_doctor": False,
            "provider_details": ""
        },
        "concerns": ""
    }
}

class PromptGenerator:
    def __init__(self):
        self.questions = [
            ("symptoms.current", "Have you experienced any of the following symptoms in the past week? (Please mention all that apply)\n- Increased thirst\n- Frequent urination\n- Unexplained weight loss\n- Increased hunger\n- Blurred vision\n- Slow-healing sores\n- Frequent infections\n- Numbness or tingling in your hands or feet\n- Fatigue\n- Any other symptoms you'd like to mention"),
            ("symptoms.blood_sugar.check_frequency", "How often do you check your blood sugar levels?\n- Daily\n- Several times a day\n- Weekly\n- Less often\n- Not at all"),
            ("symptoms.blood_sugar.fasting_range", "What is your typical fasting blood sugar range in mg/dL?"),
            ("symptoms.blood_sugar.post_meal_range", "What is your typical blood sugar range after meals in mg/dL?"),
            ("symptoms.medications.medication_list", "What medications are you taking for your diabetes? Please list the medications and their dosages."),
            ("symptoms.medications.adherence", "How often do you take your medications as prescribed?\n- Always\n- Most of the time\n- Sometimes\n- Rarely\n- Never"),
            ("symptoms.medications.problems", "What problems, if any, are you having with your diabetes medications?"),
            ("lifestyle.diet", "How would you describe your diet?\n- Very healthy\n- Somewhat healthy\n- Not very healthy\n- Unhealthy\n\nHow often do you eat fruits and vegetables?\n- Daily\n- Several times a week\n- A few times a week\n- Rarely\n- Never"),
            ("lifestyle.activity", "How often do you engage in physical activity?\n- Daily\n- Several times a week\n- A few times a week\n- Rarely\n- Never"),
            ("lifestyle.mental", "How would you rate your stress levels?\n- Very low\n- Low\n- Moderate\n- High\n- Very high\n\nHave you experienced any of the following symptoms in the past month? \n- Loss of interest in activities you used to enjoy\n- Feeling down or depressed\n- Difficulty concentrating\n- Changes in appetite\n- Sleep problems\n- Feeling hopeless or helpless\n- Thoughts of death or suicide\n- Any other symptoms you'd like to mention."),
            ("lifestyle.cognitive", "Have you noticed any changes in your memory or thinking skills? If yes, please describe the changes."),
            ("additional.conditions", "Do you have any other health conditions besides diabetes? If yes, please list them."),
            ("additional.healthcare", "Are you currently seeing a doctor or other healthcare professional for your diabetes? If yes, who are you seeing?"),
            ("additional.concerns", "Do you have any questions or concerns about your diabetes?")
        ]

    def get_next_prompt(self, current_record: Dict[str, Any]) -> Optional[Dict[str, str]]:
        for field, question in self.questions:
            if not self.is_field_complete(current_record, field):
                return {"field": field, "prompt": question}
        return None

    def is_field_complete(self, record: Dict[str, Any], section_path: str) -> bool:
        keys = section_path.split('.')
        value = record
        for key in keys:
            if isinstance(value, dict):
                value = value.get(key, {})
            elif isinstance(value, list):
                # If we're expecting a list, consider it complete if it exists
                return True
            else:
                # If we can't navigate further but we're not at the end, it's not complete
                return False
        
        def is_filled(v):
            if isinstance(v, dict):
                return any(is_filled(sub_v) for sub_v in v.values())
            elif isinstance(v, list):
                return len(v) > 0
            elif isinstance(v, str):
                return len(v.strip()) > 0
            return v is not None

        return is_filled(value)

prompt_generator = PromptGenerator()

def create_prompt(user_message: str, current_record: Dict[str, Any], current_prompt: Optional[Dict[str, str]]) -> str:
    return f"""
    ## SYSTEM INSTRUCTIONS
    You are a medical assistant helping to complete a diabetes questionnaire. Analyze the user's response
    and update the appropriate fields in the record. Only update fields explicitly mentioned in the user's message.
    You must strictly adhere to the provided schema structure.

    Current Record State:
    {json.dumps(current_record, indent=2)}

    Current Prompt:
    {json.dumps(current_prompt, indent=2)}

    ## USER MESSAGE
    {user_message}

    ## RECORD SCHEMA
    You must use this exact schema structure when updating the record:
    {json.dumps(RECORD_SCHEMA, indent=2)}

    ## EXPECTED OUTPUT FORMAT
    Provide ONLY a JSON response with the following structure. Do not include any text outside this JSON structure:
    {{
        "updated_record": {{
            // Only include fields that are present in the RECORD_SCHEMA and were mentioned by the user
        }},
        "message": "Your response message acknowledging what was updated"
    }}

    ## IMPORTANT GUIDELINES
    1. Only include sections and fields in "updated_record" that were explicitly mentioned in the user's message AND exist in the RECORD_SCHEMA.
    2. Do not create new fields or change the structure of the RECORD_SCHEMA.
    3. For medications, include both name and dosage in the medication_list array.
    4. For symptoms, set boolean flags to true only when explicitly mentioned as present.
    5. Use "Not defined" for any requested string information that the user didn't provide clearly.
    6. Ensure the JSON is valid and properly formatted before returning.
    7. Do not add any explanatory text outside the JSON structure.
    8. If you're unsure about any information, do not include it in the updated_record.

    ## SELF-VALIDATION
    Before returning your response, please verify:
    1. The JSON structure is valid and matches the expected format.
    2. Only relevant fields have been updated based on the user's input.
    3. All updated fields exist in the RECORD_SCHEMA.
    4. No new fields or structures have been added that don't exist in the RECORD_SCHEMA.
    5. The "message" field accurately reflects the updates made.

    If any of these checks fail, correct your response before returning it.
    """

def merge_user_input(current_record: Dict[str, Any], user_input: Dict[str, Any]) -> Dict[str, Any]:
    """Merge user input with the current record, updating only provided fields."""
    def deep_update(d: Dict[str, Any], u: Dict[str, Any]) -> Dict[str, Any]:
        for k, v in u.items():
            if isinstance(v, dict) and k in d and isinstance(d[k], dict):
                d[k] = deep_update(d[k], v)
            else:
                d[k] = v
        return d

    return deep_update(current_record, user_input)

def generate_content(prompt: str) -> str:
    """Generate content using Gemini Flash."""
    model = GenerativeModel("gemini-1.5-flash-002")
    
    generation_config = {
        "max_output_tokens": 8192,
        "temperature": 0.1,  # Lower temperature for more consistent responses
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

    try:
        response = model.generate_content(
            prompt,
            generation_config=generation_config,
            safety_settings=safety_settings,
            stream=False
        )
        
        if response.text:
            return response.text
        else:
            logger.error("Gemini API returned an empty response")
            return json.dumps({
                "updated_record": {},
                "message": "I apologize, but I couldn't generate a proper response. Could you please try again?"
            })
    except Exception as e:
        logger.error(f"Error generating content from Gemini API: {str(e)}")
        return json.dumps({
            "updated_record": {},
            "message": "I'm sorry, but there was an error processing your request. Please try again later."
        })

def is_record_complete(record: Dict[str, Any]) -> bool:
    """Check if all required sections of the record have been filled."""
    def check_section(section: Dict[str, Any]) -> bool:
        if isinstance(section, dict):
            return any(check_section(v) for v in section.values())
        return bool(section)

    return all(
        check_section(record[main_section])
        for main_section in ["symptoms", "lifestyle", "additional"]
    )

def validate_input(user_message: str, current_record: Dict[str, Any]) -> Tuple[bool, str]:
    """Validate user input and current record."""
    if not user_message.strip():
        return False, "User message cannot be empty."
    if not isinstance(current_record, dict):
        return False, "Invalid current record format."
    return True, ""

def generate_summary(record: Dict[str, Any]) -> str:
    """Generate a summary of the patient's responses."""
    prompt = f"""
    Based on the following patient record, generate a concise summary (2-3 sentences) highlighting the key points:

    {json.dumps(record, indent=2)}

    The summary should cover:
    1. Common diabetes symptoms experienced
    2. Any medication side effects
    3. Mental health concerns
    4. Cognitive difficulties
    5. A recommendation to discuss these issues with their healthcare provider

    Format the response as a single paragraph without bullet points, in second person "Your responses indicate that you are experiencing several common symptoms of diabetes, including increased thirst, frequent urination" etc.
    """

    try:
        summary = generate_content(prompt)
        
        # Attempt to parse the response as JSON and extract the 'message' field
        try:
            response_json = json.loads(summary)
            if isinstance(response_json, dict) and "message" in response_json:
                return response_json["message"].strip()
        except json.JSONDecodeError:
            # If parsing fails, assume the entire response is the summary
            pass

        return summary.strip()
    except Exception as e:
        logger.error(f"Error generating summary: {str(e)}")
        return "We apologize, but we couldn't generate a summary of your responses at this time. Please review your answers and discuss them with your healthcare provider."


@functions_framework.http
def process_message(request):
    """HTTP Cloud Function for processing diabetes questionnaire responses."""
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
        # Parse request data
        request_json = request.get_json(silent=True)
        if not request_json:
            return jsonify({"error": "No JSON data provided"}), 400, headers

        # Extract required data from request
        user_message: str = request_json.get('userMessage')
        current_record: Dict[str, Any] = request_json.get('currentRecord', RECORD_SCHEMA.copy())
        current_prompt: Optional[Dict[str, str]] = request_json.get('currentPrompt')

        # Validate input
        is_valid, error_message = validate_input(user_message, current_record)
        if not is_valid:
            return jsonify({"error": error_message}), 400, headers

        # Generate and process response
        prompt = create_prompt(user_message, current_record, current_prompt)
        response_text = generate_content(prompt)
        
        # Log the response for debugging
        logger.info(f"Gemini API response: {response_text}")

        # Attempt to parse the response as JSON
        try:
            # Strip markdown code block if present
            response_text = response_text.strip().strip('`').strip()
            if response_text.startswith('json'):
                response_text = response_text[4:].strip()
            # Find the first '{' and the last '}' to extract the JSON object
            start = response_text.find('{')
            end = response_text.rfind('}') + 1
            if start != -1 and end != -1:
                response_text = response_text[start:end]
            response_json = json.loads(response_text)
        except json.JSONDecodeError as json_err:
            logger.error(f"Failed to parse Gemini response as JSON: {str(json_err)}")
            logger.error(f"Raw response: {response_text}")
            
            # Fallback: create a simple response
            response_json = {
                "updated_record": {},
                "message": "I'm sorry, but I couldn't process your input correctly. Let me ask you about the next item we need to complete."
            }

        if isinstance(response_json, dict) and "updated_record" in response_json:
            # Ensure updated_record has all necessary sections
            for section in RECORD_SCHEMA:
                if section not in response_json["updated_record"]:
                    response_json["updated_record"][section] = {}
            
            updated_record = merge_user_input(current_record, response_json["updated_record"])
            
            # Explicit handling for "no" responses
            if "no" in user_message.lower():
                if current_prompt and current_prompt['field'] == "additional.conditions":
                    updated_record['additional']['conditions'] = {"has_conditions": False}

            # Check if any fields were actually updated
            if updated_record == current_record:
                # No updates were made, so we should prompt for the next available field
                next_prompt = prompt_generator.get_next_prompt(current_record)
                if next_prompt:
                    response_json["message"] = f"{response_json.get('message', '')} {next_prompt['prompt']}"
                else:
                    summary = generate_summary(updated_record)
                    response_json["message"] = f"Thank you for completing the intake! You may modify your entries at any time. {summary}"
            else:
                # Fields were updated, so get the next prompt based on the updated record
                next_prompt = prompt_generator.get_next_prompt(updated_record)

            record_complete = is_record_complete(updated_record)

            return jsonify({
                "updated_record": updated_record,
                "next_prompt": next_prompt,
                "ready_to_insert": record_complete,
                "message": response_json.get("message", ""),
                "completedSections": get_completed_sections(updated_record)
            }), 200, headers
        else:
            logger.error(f"Invalid response structure from Gemini: {response_json}")
            raise ValueError("Invalid response structure from Gemini")

    except Exception as e:
        logger.error(f"Error processing message: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "error": "An unexpected error occurred. Please try again later."
        }), 500, headers

def get_completed_sections(record: Dict[str, Any]) -> List[str]:
    completed = []
    
    def is_section_filled(section: Any) -> bool:
        if isinstance(section, dict):
            return any(is_section_filled(v) for v in section.values())
        elif isinstance(section, list):
            return bool(section)
        elif isinstance(section, str):
            return bool(section.strip())  # Consider only non-empty strings as filled
        return section is not None and section != ""

    # Symptoms section
    symptoms = record.get("symptoms", {})
    if is_section_filled(symptoms.get("current")):
        completed.append("symptoms-current")
    if is_section_filled(symptoms.get("blood_sugar")):
        completed.append("symptoms-blood-sugar")
    if is_section_filled(symptoms.get("medications")):
        completed.append("symptoms-medications")
        completed.append("symptoms-problems")  # Assuming problems are part of medications

    # Lifestyle section
    lifestyle = record.get("lifestyle", {})
    if is_section_filled(lifestyle.get("diet")):
        completed.append("lifestyle-diet")
    if is_section_filled(lifestyle.get("activity")):
        completed.append("lifestyle-activity")
    if is_section_filled(lifestyle.get("mental")):
        completed.append("lifestyle-mental")
    if is_section_filled(lifestyle.get("cognitive")):
        completed.append("lifestyle-cognitive")

    # Additional section
    additional = record.get("additional", {})
    if is_section_filled(additional.get("conditions")):
        completed.append("additional-conditions")
    if is_section_filled(additional.get("healthcare")):
        completed.append("additional-healthcare")
    if is_section_filled(additional.get("concerns")):
        completed.append("additional-concerns")

    return completed

if __name__ == "__main__":
    # This is used when running locally only
    from flask import Flask, request
    app = Flask(__name__)
    CORS(app)
    
    @app.route('/', methods=['POST'])
    def local_process_message():
        return process_message(request)
    
    app.run(host='localhost', port=8080, debug=True)
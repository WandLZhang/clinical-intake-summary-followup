import functions_framework
from google.cloud import bigquery
from flask import jsonify, request

# Initialize the BigQuery client
client = bigquery.Client()

# SQL query template
SQL_QUERY = """
SELECT 
  P.id AS patientId, 
  P.last_name, 
  ARRAY_TO_STRING(P.first_name, " ") AS First_name, 
  C.condition_code AS Diabetes_Code, 
  C.condition_desc AS Diabetes_Description, 
  STRING_AGG(DISTINCT MR.medication_name, ", ") AS Diabetes_Medications, 
  COUNT(DISTINCT MR.medication_name) AS Diabetes_Med_Count 
FROM 
  (SELECT 
    id, 
    name[SAFE_OFFSET(0)].family AS last_name, 
    name[SAFE_OFFSET(0)].given AS first_name, 
    TIMESTAMP(deceased.dateTime) AS deceased_datetime 
  FROM `bigquery-public-data.fhir_synthea.patient`) AS P 
JOIN 
  (SELECT 
    subject.patientId AS PatientId, 
    code.coding[SAFE_OFFSET(0)].code AS condition_code, 
    code.coding[SAFE_OFFSET(0)].display AS condition_desc 
  FROM `bigquery-public-data.fhir_synthea.condition` 
  WHERE code.coding[SAFE_OFFSET(0)].display = 'Diabetes' 
  ) AS C 
ON P.id = C.PatientId 
JOIN 
  (SELECT 
    subject.patientId AS patientId, 
    medication.codeableConcept.coding[SAFE_OFFSET(0)].display AS medication_name, 
    reasonCode[SAFE_OFFSET(0)].coding[SAFE_OFFSET(0)].display AS medication_reason 
  FROM `bigquery-public-data.fhir_synthea.medication_request` 
  WHERE status = 'active' 
  ) AS MR 
ON P.id = MR.patientId 
WHERE 
  P.deceased_datetime IS NULL 
  AND P.id LIKE CONCAT(@patient_id, '%')
GROUP BY 
  P.id, P.last_name, P.first_name, C.condition_code, C.condition_desc 
HAVING 
  COUNT(DISTINCT MR.medication_name) >= 1 
ORDER BY 
  P.last_name, Diabetes_Med_Count DESC
LIMIT 1
"""

@functions_framework.http
def query_patient_medications(request):
    """
    Cloud Function to query patient medications for diabetes.
    
    Args:
        request (flask.Request): The request object.
        
    Returns:
        flask.Response: JSON response containing the Diabetes_Medications string or an error message.
    """
    # Set CORS headers for the preflight request
    if request.method == 'OPTIONS':
        # Allows GET and POST requests from any origin with the Content-Type
        # header and caches preflight response for 3600s
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '3600'
        }
        return ('', 204, headers)

    # Set CORS headers for the main request
    headers = {
        'Access-Control-Allow-Origin': '*'
    }

    try:
        # Get patientId from the request (either GET or POST)
        if request.method == 'GET':
            patient_id = request.args.get('patientId')
        elif request.method == 'POST':
            request_json = request.get_json(silent=True)
            patient_id = request_json.get('patientId') if request_json else None
        else:
            return jsonify({'error': 'Unsupported method'}), 405, headers

        if not patient_id:
            return jsonify({'error': 'Patient ID is required'}), 400, headers

        # Create a query job
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("patient_id", "STRING", patient_id)
            ]
        )
        query_job = client.query(SQL_QUERY, job_config=job_config)

        # Wait for the query to complete
        results = query_job.result()

        # Fetch the results
        rows = list(results)

        if not rows:
            return jsonify({'message': 'No diabetes medications found for this patient'}), 404, headers

        # Extract the Diabetes_Medications string
        diabetes_medications = rows[0]['Diabetes_Medications']

        return jsonify({'medications': diabetes_medications}), 200, headers

    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({'error': 'An error occurred while processing your request'}), 500, headers

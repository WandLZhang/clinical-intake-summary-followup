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
  P.deceased_datetime IS NULL  -- Only alive patients
GROUP BY 
  P.id, P.last_name, P.first_name, C.condition_code, C.condition_desc
HAVING 
  COUNT(DISTINCT MR.medication_name) >= 1  -- Patients with at least one diabetes medication
ORDER BY 
  P.last_name, Diabetes_Med_Count DESC

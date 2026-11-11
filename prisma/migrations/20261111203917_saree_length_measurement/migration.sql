-- Sarees are measured end to end (typically 5.5–6.5 m), so `length_mm` needs a wider range than
-- body measurements. Other measurements keep the 10–300 cm range.
ALTER TABLE outfit_measurements DROP CONSTRAINT outfit_measurements_range;

ALTER TABLE outfit_measurements
  ADD CONSTRAINT outfit_measurements_range CHECK (
        (chest_mm IS NULL OR chest_mm BETWEEN 100 AND 3000)
    AND (waist_mm IS NULL OR waist_mm BETWEEN 100 AND 3000)
    AND (hip_mm IS NULL OR hip_mm BETWEEN 100 AND 3000)
    AND (shoulder_mm IS NULL OR shoulder_mm BETWEEN 100 AND 3000)
    AND (sleeve_mm IS NULL OR sleeve_mm BETWEEN 100 AND 3000)
    AND (length_mm IS NULL OR length_mm BETWEEN 100 AND 10000)
    AND (bottom_waist_mm IS NULL OR bottom_waist_mm BETWEEN 100 AND 3000)
    AND (bottom_length_mm IS NULL OR bottom_length_mm BETWEEN 100 AND 3000));

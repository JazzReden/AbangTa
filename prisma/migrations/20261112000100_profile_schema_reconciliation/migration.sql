-- Some development databases already have these nullable columns from schema sync.

SELECT GROUP_CONCAT(CONCAT('ADD COLUMN `', candidate.name, '` VARCHAR(191) NULL') ORDER BY candidate.name SEPARATOR ', ')
INTO @missing_profile_columns
FROM (
    SELECT 'gcashName' AS name
    UNION ALL SELECT 'gcashNumber' AS name
    UNION ALL SELECT 'bankName' AS name
    UNION ALL SELECT 'bankAccountName' AS name
    UNION ALL SELECT 'bankAccountNumber' AS name
    UNION ALL SELECT 'taxIdNumber' AS name
    UNION ALL SELECT 'officeAddress' AS name
) AS candidate
WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS AS existing
    WHERE existing.TABLE_SCHEMA = DATABASE()
      AND existing.TABLE_NAME = 'landlord_profiles'
      AND existing.COLUMN_NAME = candidate.name
);

SET @profile_migration_sql = IF(
    @missing_profile_columns IS NULL,
    'DO 0',
    CONCAT('ALTER TABLE `landlord_profiles` ', @missing_profile_columns)
);
PREPARE profile_migration FROM @profile_migration_sql;
EXECUTE profile_migration;
DEALLOCATE PREPARE profile_migration;

SELECT GROUP_CONCAT(CONCAT('ADD COLUMN `', candidate.name, '` VARCHAR(191) NULL') ORDER BY candidate.name SEPARATOR ', ')
INTO @missing_profile_columns
FROM (
    SELECT 'occupation' AS name
    UNION ALL SELECT 'companyOrSchool' AS name
    UNION ALL SELECT 'permanentAddress' AS name
) AS candidate
WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS AS existing
    WHERE existing.TABLE_SCHEMA = DATABASE()
      AND existing.TABLE_NAME = 'tenant_profiles'
      AND existing.COLUMN_NAME = candidate.name
);

SET @profile_migration_sql = IF(
    @missing_profile_columns IS NULL,
    'DO 0',
    CONCAT('ALTER TABLE `tenant_profiles` ', @missing_profile_columns)
);
PREPARE profile_migration FROM @profile_migration_sql;
EXECUTE profile_migration;
DEALLOCATE PREPARE profile_migration;

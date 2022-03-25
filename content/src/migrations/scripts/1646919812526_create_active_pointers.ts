import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('active_pointers', {
    pointer: { type: 'text', primaryKey: true },
    entity_id: { type: 'text', notNull: true }
  })

  // Delete invalid deployments:
  // PROD:

  //    ('Qmf4mqT2zmSsqE13oT3jjaBNjNHcjLx9F1C92AjrXc1ka2',
  //  'QmUuFnCByfEpW3HbdXnz934GPZdgx5yhRNP1pK8xV3S3LC',
  //  'QmP88dmsDdmbAZMDSTT79gUm5RC8rtVFCfUxPuPAzDjrK2',
  //  'QmTbjzg1WMUoD4WVcJPRmAue27hXV7uojCTYJxJX9kjzFz',
  //  'QmR5KMWEUqKQutqxgbwMZMLjaxsfVseHa3xKccVvBp87yF',
  //  'QmWg6cZ7wv3N1PLqMnNrdS5TkR8rnvGHJf9s7BzsRe9aQW',
  //  'QmegmyF39QLNr4pZfoFoHJk5H1BKF1RLz7JZAWQHBYJR2E',
  //  'QmbC2S6enkyiikFLhXM4wx5jLabehakQnL1ZFEAgfWGBrL',
  //  'QmfYvhv3Q3MuVfWg1hWPSbC8MEgonTpm2YpxWfaoAfWDms',
  //  'QmepRKdSEnRfaeMpa5QrwSgRpg8ew5teQLJn4K2XpRJbxW',
  //  'Qmecc1ev7kvY9X1hndas835ry6RigcgQFMiuJEL9gvvnYS',
  //  'QmQpgnczwGSNMmRLq75xhkiLu7xMZoyuHi3Y6uuREEUsU7')

  // .ZONE:

  pgm.sql(` DELETE FROM deployment_deltas
  WHERE
  deployment = ANY (
    SELECT id FROM deployments as e
    WHERE
    e.entity_id IN ('QmfReuGvY7w5M8ruy7P6mdy7iWLi9FQvEWsLM1e26jVkso',
    'QmUDC8pScvsTDPLMsa7zmh1y9uczA2EAeqYQktBMQMDhiK',
    'QmcQ86oa5xpJPrxv438PxnhaYwd2Xtn4A4WGS7mEVFP13T',
    'QmTQJdtNd75iN6zqdFTq4bgm3TSDggLBunduaKHJLewypX',
    'QmfSLhQcYxFGW8tX4A5XEJJh3FJLGsmFwqegSYhEHFGgLF',
    'QmdHGYemGN6pRjJRmuEEJQ8ab4Kk2ukoccjYZmbS8swdrW',
    'Qmajbneoes27V7UKnGFS8a2BN9z1fFU1Y9ciGN4KVU4nU1',
    'QmPC1fZdg8h17q635W12wCLfHeSRvPWtF9N7oBitvmAqEn',
    'QmcsbmLBsy9TrGJGT6kKDDH4HNMCyKworDmuWcZ2L16QwW',
    'QmSzKrauugtQn8LV1HDKG3c5yeoikM2uWCsYUe92xBC1og',
    'QmP1fHp9nqRDYGsb16z72VZbGYcmKo8YvFcagggoiAvDnh',
    'QmUxM21yTjrv132SkygBwCupntqJmC3WadCHSjha1envDc',
    'Qmb4Xob2q1ZkR5Rv1xjEboGJDWyvHBRAquqBePSKdJ5Dgp')
  );`)

  pgm.sql(` DELETE FROM last_deployed_pointers
  WHERE
  deployment = ANY (
    SELECT id FROM deployments as e
    WHERE
    e.entity_id IN ('QmfReuGvY7w5M8ruy7P6mdy7iWLi9FQvEWsLM1e26jVkso',
    'QmUDC8pScvsTDPLMsa7zmh1y9uczA2EAeqYQktBMQMDhiK',
    'QmcQ86oa5xpJPrxv438PxnhaYwd2Xtn4A4WGS7mEVFP13T',
    'QmTQJdtNd75iN6zqdFTq4bgm3TSDggLBunduaKHJLewypX',
    'QmfSLhQcYxFGW8tX4A5XEJJh3FJLGsmFwqegSYhEHFGgLF',
    'QmdHGYemGN6pRjJRmuEEJQ8ab4Kk2ukoccjYZmbS8swdrW',
    'Qmajbneoes27V7UKnGFS8a2BN9z1fFU1Y9ciGN4KVU4nU1',
    'QmPC1fZdg8h17q635W12wCLfHeSRvPWtF9N7oBitvmAqEn',
    'QmcsbmLBsy9TrGJGT6kKDDH4HNMCyKworDmuWcZ2L16QwW',
    'QmSzKrauugtQn8LV1HDKG3c5yeoikM2uWCsYUe92xBC1og',
    'QmP1fHp9nqRDYGsb16z72VZbGYcmKo8YvFcagggoiAvDnh',
    'QmUxM21yTjrv132SkygBwCupntqJmC3WadCHSjha1envDc',
    'Qmb4Xob2q1ZkR5Rv1xjEboGJDWyvHBRAquqBePSKdJ5Dgp')
  );`)

  pgm.sql(` DELETE FROM pointer_history
  WHERE
  deployment = ANY (
    SELECT id FROM deployments as e
    WHERE
    e.entity_id IN ('QmfReuGvY7w5M8ruy7P6mdy7iWLi9FQvEWsLM1e26jVkso',
    'QmUDC8pScvsTDPLMsa7zmh1y9uczA2EAeqYQktBMQMDhiK',
    'QmcQ86oa5xpJPrxv438PxnhaYwd2Xtn4A4WGS7mEVFP13T',
    'QmTQJdtNd75iN6zqdFTq4bgm3TSDggLBunduaKHJLewypX',
    'QmfSLhQcYxFGW8tX4A5XEJJh3FJLGsmFwqegSYhEHFGgLF',
    'QmdHGYemGN6pRjJRmuEEJQ8ab4Kk2ukoccjYZmbS8swdrW',
    'Qmajbneoes27V7UKnGFS8a2BN9z1fFU1Y9ciGN4KVU4nU1',
    'QmPC1fZdg8h17q635W12wCLfHeSRvPWtF9N7oBitvmAqEn',
    'QmcsbmLBsy9TrGJGT6kKDDH4HNMCyKworDmuWcZ2L16QwW',
    'QmSzKrauugtQn8LV1HDKG3c5yeoikM2uWCsYUe92xBC1og',
    'QmP1fHp9nqRDYGsb16z72VZbGYcmKo8YvFcagggoiAvDnh',
    'QmUxM21yTjrv132SkygBwCupntqJmC3WadCHSjha1envDc',
    'Qmb4Xob2q1ZkR5Rv1xjEboGJDWyvHBRAquqBePSKdJ5Dgp')
  );`)

  pgm.sql(` DELETE FROM content_files
  WHERE
  deployment = ANY (
    SELECT id FROM deployments as e
    WHERE
    e.entity_id IN ('QmfReuGvY7w5M8ruy7P6mdy7iWLi9FQvEWsLM1e26jVkso',
    'QmUDC8pScvsTDPLMsa7zmh1y9uczA2EAeqYQktBMQMDhiK',
    'QmcQ86oa5xpJPrxv438PxnhaYwd2Xtn4A4WGS7mEVFP13T',
    'QmTQJdtNd75iN6zqdFTq4bgm3TSDggLBunduaKHJLewypX',
    'QmfSLhQcYxFGW8tX4A5XEJJh3FJLGsmFwqegSYhEHFGgLF',
    'QmdHGYemGN6pRjJRmuEEJQ8ab4Kk2ukoccjYZmbS8swdrW',
    'Qmajbneoes27V7UKnGFS8a2BN9z1fFU1Y9ciGN4KVU4nU1',
    'QmPC1fZdg8h17q635W12wCLfHeSRvPWtF9N7oBitvmAqEn',
    'QmcsbmLBsy9TrGJGT6kKDDH4HNMCyKworDmuWcZ2L16QwW',
    'QmSzKrauugtQn8LV1HDKG3c5yeoikM2uWCsYUe92xBC1og',
    'QmP1fHp9nqRDYGsb16z72VZbGYcmKo8YvFcagggoiAvDnh',
    'QmUxM21yTjrv132SkygBwCupntqJmC3WadCHSjha1envDc',
    'Qmb4Xob2q1ZkR5Rv1xjEboGJDWyvHBRAquqBePSKdJ5Dgp')
  );`)

  pgm.sql(`DELETE FROM deployments
  WHERE entity_id IN
  ('QmfReuGvY7w5M8ruy7P6mdy7iWLi9FQvEWsLM1e26jVkso',
  'QmUDC8pScvsTDPLMsa7zmh1y9uczA2EAeqYQktBMQMDhiK',
  'QmcQ86oa5xpJPrxv438PxnhaYwd2Xtn4A4WGS7mEVFP13T',
  'QmTQJdtNd75iN6zqdFTq4bgm3TSDggLBunduaKHJLewypX',
  'QmfSLhQcYxFGW8tX4A5XEJJh3FJLGsmFwqegSYhEHFGgLF',
  'QmdHGYemGN6pRjJRmuEEJQ8ab4Kk2ukoccjYZmbS8swdrW',
  'Qmajbneoes27V7UKnGFS8a2BN9z1fFU1Y9ciGN4KVU4nU1',
  'QmPC1fZdg8h17q635W12wCLfHeSRvPWtF9N7oBitvmAqEn',
  'QmcsbmLBsy9TrGJGT6kKDDH4HNMCyKworDmuWcZ2L16QwW',
  'QmSzKrauugtQn8LV1HDKG3c5yeoikM2uWCsYUe92xBC1og',
  'QmP1fHp9nqRDYGsb16z72VZbGYcmKo8YvFcagggoiAvDnh',
  'QmUxM21yTjrv132SkygBwCupntqJmC3WadCHSjha1envDc',
  'Qmb4Xob2q1ZkR5Rv1xjEboGJDWyvHBRAquqBePSKdJ5Dgp');`)

  pgm.sql('ALTER TABLE deployments DROP CONSTRAINT IF EXISTS deployments_uniq_entity_id_entity_type;')
  pgm.sql(`ALTER TABLE deployments ADD UNIQUE (entity_id);`)

  pgm.sql(`
    INSERT INTO active_pointers (pointer, entity_id)
    SELECT UNNEST(entity_pointers) as pointer, entity_id
    FROM deployments
    WHERE deleter_deployment IS NULL;
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('active_pointers')
}

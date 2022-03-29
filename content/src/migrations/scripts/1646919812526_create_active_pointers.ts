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
    e.entity_id IN (
      'QmXVu6DMfRbVrzGFVbjNhKik8H4hE5X7yFFf4cWCGpZ6CL',
      'QmbAMNjND7rPZyMBX8yWyvTod9a1zvbhXDRnT9jyJiz4Md',
      'QmR1bYDjkfgAwagtp4qQPnKosWUU6mMGnWeYhf29T2zwe7',
      'QmcfZ7PBZQeoom9LD1AjvjwJZyXdugo3a37jGW2jPJYGSi',
      'QmdBL5BSsH71RPFCSDVuQjBgDB75MaFD1129t13LLwU7Uo',
      'QmW41RH1q6cNeXt1HGoX5ALk36svRrpgtrQMk4fhHkz8Q8',
      'QmUt14KwbLQ8jmwYSUPqbPkFQbU8ndMXhjoyFPX44DijEP',
      'QmTjFHnepcu5NSTcofCZzpkVmkLkApBzKiDqa18xdek8Gg',
      'QmVttiMyAu2FXwfLHDSbWZRQeXKA8NU3gqBi39ETFLK4i5',
      'QmUGEFccxPpXx2EVWWwj98ZU3EjsUyALfBQLBmB2QrMSu8',
      'QmSMQUriiP7hMvJn7RpK2mWaXAgRvCbKkUfgh83iYZ1wNU')
  );`)

  pgm.sql(` DELETE FROM last_deployed_pointers
  WHERE
  deployment = ANY (
    SELECT id FROM deployments as e
    WHERE
    e.entity_id IN (
      'QmXVu6DMfRbVrzGFVbjNhKik8H4hE5X7yFFf4cWCGpZ6CL',
      'QmbAMNjND7rPZyMBX8yWyvTod9a1zvbhXDRnT9jyJiz4Md',
      'QmR1bYDjkfgAwagtp4qQPnKosWUU6mMGnWeYhf29T2zwe7',
      'QmcfZ7PBZQeoom9LD1AjvjwJZyXdugo3a37jGW2jPJYGSi',
      'QmdBL5BSsH71RPFCSDVuQjBgDB75MaFD1129t13LLwU7Uo',
      'QmW41RH1q6cNeXt1HGoX5ALk36svRrpgtrQMk4fhHkz8Q8',
      'QmUt14KwbLQ8jmwYSUPqbPkFQbU8ndMXhjoyFPX44DijEP',
      'QmTjFHnepcu5NSTcofCZzpkVmkLkApBzKiDqa18xdek8Gg',
      'QmVttiMyAu2FXwfLHDSbWZRQeXKA8NU3gqBi39ETFLK4i5',
      'QmUGEFccxPpXx2EVWWwj98ZU3EjsUyALfBQLBmB2QrMSu8',
      'QmSMQUriiP7hMvJn7RpK2mWaXAgRvCbKkUfgh83iYZ1wNU')
  );`)

  pgm.sql(` DELETE FROM pointer_history
  WHERE
  deployment = ANY (
    SELECT id FROM deployments as e
    WHERE
    e.entity_id IN (
      'QmXVu6DMfRbVrzGFVbjNhKik8H4hE5X7yFFf4cWCGpZ6CL',
      'QmbAMNjND7rPZyMBX8yWyvTod9a1zvbhXDRnT9jyJiz4Md',
      'QmR1bYDjkfgAwagtp4qQPnKosWUU6mMGnWeYhf29T2zwe7',
      'QmcfZ7PBZQeoom9LD1AjvjwJZyXdugo3a37jGW2jPJYGSi',
      'QmdBL5BSsH71RPFCSDVuQjBgDB75MaFD1129t13LLwU7Uo',
      'QmW41RH1q6cNeXt1HGoX5ALk36svRrpgtrQMk4fhHkz8Q8',
      'QmUt14KwbLQ8jmwYSUPqbPkFQbU8ndMXhjoyFPX44DijEP',
      'QmTjFHnepcu5NSTcofCZzpkVmkLkApBzKiDqa18xdek8Gg',
      'QmVttiMyAu2FXwfLHDSbWZRQeXKA8NU3gqBi39ETFLK4i5',
      'QmUGEFccxPpXx2EVWWwj98ZU3EjsUyALfBQLBmB2QrMSu8',
      'QmSMQUriiP7hMvJn7RpK2mWaXAgRvCbKkUfgh83iYZ1wNU')
  );`)

  pgm.sql(` DELETE FROM content_files
  WHERE
  deployment = ANY (
    SELECT id FROM deployments as e
    WHERE
    e.entity_id IN (
      'QmXVu6DMfRbVrzGFVbjNhKik8H4hE5X7yFFf4cWCGpZ6CL',
      'QmbAMNjND7rPZyMBX8yWyvTod9a1zvbhXDRnT9jyJiz4Md',
      'QmR1bYDjkfgAwagtp4qQPnKosWUU6mMGnWeYhf29T2zwe7',
      'QmcfZ7PBZQeoom9LD1AjvjwJZyXdugo3a37jGW2jPJYGSi',
      'QmdBL5BSsH71RPFCSDVuQjBgDB75MaFD1129t13LLwU7Uo',
      'QmW41RH1q6cNeXt1HGoX5ALk36svRrpgtrQMk4fhHkz8Q8',
      'QmUt14KwbLQ8jmwYSUPqbPkFQbU8ndMXhjoyFPX44DijEP',
      'QmTjFHnepcu5NSTcofCZzpkVmkLkApBzKiDqa18xdek8Gg',
      'QmVttiMyAu2FXwfLHDSbWZRQeXKA8NU3gqBi39ETFLK4i5',
      'QmUGEFccxPpXx2EVWWwj98ZU3EjsUyALfBQLBmB2QrMSu8',
      'QmSMQUriiP7hMvJn7RpK2mWaXAgRvCbKkUfgh83iYZ1wNU')
  );`)

  pgm.sql(`DELETE FROM deployments
  WHERE entity_id IN (
      'QmXVu6DMfRbVrzGFVbjNhKik8H4hE5X7yFFf4cWCGpZ6CL',
      'QmbAMNjND7rPZyMBX8yWyvTod9a1zvbhXDRnT9jyJiz4Md',
      'QmR1bYDjkfgAwagtp4qQPnKosWUU6mMGnWeYhf29T2zwe7',
      'QmcfZ7PBZQeoom9LD1AjvjwJZyXdugo3a37jGW2jPJYGSi',
      'QmdBL5BSsH71RPFCSDVuQjBgDB75MaFD1129t13LLwU7Uo',
      'QmW41RH1q6cNeXt1HGoX5ALk36svRrpgtrQMk4fhHkz8Q8',
      'QmUt14KwbLQ8jmwYSUPqbPkFQbU8ndMXhjoyFPX44DijEP',
      'QmTjFHnepcu5NSTcofCZzpkVmkLkApBzKiDqa18xdek8Gg',
      'QmVttiMyAu2FXwfLHDSbWZRQeXKA8NU3gqBi39ETFLK4i5',
      'QmUGEFccxPpXx2EVWWwj98ZU3EjsUyALfBQLBmB2QrMSu8',
      'QmSMQUriiP7hMvJn7RpK2mWaXAgRvCbKkUfgh83iYZ1wNU');`)

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

import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('active_pointers', {
    pointer: { type: 'text', primaryKey: true },
    entity_id: { type: 'text', notNull: true }
  })

  // Delete invalid deployments:
  // PROD:
  // 'QmYgsjNDKzoCLtmhGfWnoXHbKtpJ3hjsqSktKwSN14NGRt',
  // 'QmX5HsazaYxox9NmCYHMKwRwMRiXDC7qWsrySXMid5gdTH',
  // 'Qmd2nKrPjSZB4FWsXEWSwkRJJ37iEEVr7NoGnqkdcacVNe',
  // 'QmRJhrvSRWYx2WD9yWcwNekCgRSaoSMfWcubDS4pSi1tJR',
  // 'QmQJJA5rVujKKqvYdCfxUJUUYJ1AckW2AQCEhM7ARUynME',
  // 'QmTN4VzJYnabWAafkgqScnvqeQ3VD3hj9W7jnxBN6e2gdJ',
  // 'QmUN62XUhMuZb5GeviCZ3v9H3H1ZE3cbYJASqH4Fdh1hSP',
  // 'QmecbenQT8VJHHg86pLvr6khHrEFaCwK6T2jMHFg85eLAR',
  // 'QmfBQHZUaGmcGtpy8bbq9gFK4iXdWdpikWt61VcgA25kW3',
  // 'QmZDsE3zwmhin3p4DP5niQDGHxXBXJ4YZsDehj8K751JHi',
  // 'QmfVr3wwfqiKqVbA8yW4buMqD215kPRdQrAFhhoQ8RENtY',
  // 'QmbPu37FBPQVWWmKoCUZf11HrzDvuaKXYJ3dXeK8SzhvfZ'

  // .ZONE:

  pgm.sql(` DELETE FROM deployment_deltas
  WHERE
  deployment = ANY (
    SELECT id FROM deployments as e
    WHERE
    e.entity_id IN ('QmXVu6DMfRbVrzGFVbjNhKik8H4hE5X7yFFf4cWCGpZ6CL',
      'QmbAMNjND7rPZyMBX8yWyvTod9a1zvbhXDRnT9jyJiz4Md',
      'QmR1bYDjkfgAwagtp4qQPnKosWUU6mMGnWeYhf29T2zwe7',
      'QmcfZ7PBZQeoom9LD1AjvjwJZyXdugo3a37jGW2jPJYGSi',
      'QmdBL5BSsH71RPFCSDVuQjBgDB75MaFD1129t13LLwU7Uo',
      'QmW41RH1q6cNeXt1HGoX5ALk36svRrpgtrQMk4fhHkz8Q8',
      'QmUt14KwbLQ8jmwYSUPqbPkFQbU8ndMXhjoyFPX44DijEP',
      'QmTjFHnepcu5NSTcofCZzpkVmkLkApBzKiDqa18xdek8Gg',
      'QmVttiMyAu2FXwfLHDSbWZRQeXKA8NU3gqBi39ETFLK4i5',
      'QmUGEFccxPpXx2EVWWwj98ZU3EjsUyALfBQLBmB2QrMSu8',
      'QmSMQUriiP7hMvJn7RpK2mWaXAgRvCbKkUfgh83iYZ1wNU',
      'Qmc5ZxCYQJvuwPynda8akcqJymNbL8YdNCT6WXry7DkgtJ')
  );`)

  pgm.sql(` DELETE FROM last_deployed_pointers
  WHERE
  deployment = ANY (
    SELECT id FROM deployments as e
    WHERE
    e.entity_id IN ('QmXVu6DMfRbVrzGFVbjNhKik8H4hE5X7yFFf4cWCGpZ6CL',
      'QmbAMNjND7rPZyMBX8yWyvTod9a1zvbhXDRnT9jyJiz4Md',
      'QmR1bYDjkfgAwagtp4qQPnKosWUU6mMGnWeYhf29T2zwe7',
      'QmcfZ7PBZQeoom9LD1AjvjwJZyXdugo3a37jGW2jPJYGSi',
      'QmdBL5BSsH71RPFCSDVuQjBgDB75MaFD1129t13LLwU7Uo',
      'QmW41RH1q6cNeXt1HGoX5ALk36svRrpgtrQMk4fhHkz8Q8',
      'QmUt14KwbLQ8jmwYSUPqbPkFQbU8ndMXhjoyFPX44DijEP',
      'QmTjFHnepcu5NSTcofCZzpkVmkLkApBzKiDqa18xdek8Gg',
      'QmVttiMyAu2FXwfLHDSbWZRQeXKA8NU3gqBi39ETFLK4i5',
      'QmUGEFccxPpXx2EVWWwj98ZU3EjsUyALfBQLBmB2QrMSu8',
      'QmSMQUriiP7hMvJn7RpK2mWaXAgRvCbKkUfgh83iYZ1wNU',
      'Qmc5ZxCYQJvuwPynda8akcqJymNbL8YdNCT6WXry7DkgtJ')
  );`)

  pgm.sql(` DELETE FROM pointer_history
  WHERE
  deployment = ANY (
    SELECT id FROM deployments as e
    WHERE
    e.entity_id IN ('QmXVu6DMfRbVrzGFVbjNhKik8H4hE5X7yFFf4cWCGpZ6CL',
      'QmbAMNjND7rPZyMBX8yWyvTod9a1zvbhXDRnT9jyJiz4Md',
      'QmR1bYDjkfgAwagtp4qQPnKosWUU6mMGnWeYhf29T2zwe7',
      'QmcfZ7PBZQeoom9LD1AjvjwJZyXdugo3a37jGW2jPJYGSi',
      'QmdBL5BSsH71RPFCSDVuQjBgDB75MaFD1129t13LLwU7Uo',
      'QmW41RH1q6cNeXt1HGoX5ALk36svRrpgtrQMk4fhHkz8Q8',
      'QmUt14KwbLQ8jmwYSUPqbPkFQbU8ndMXhjoyFPX44DijEP',
      'QmTjFHnepcu5NSTcofCZzpkVmkLkApBzKiDqa18xdek8Gg',
      'QmVttiMyAu2FXwfLHDSbWZRQeXKA8NU3gqBi39ETFLK4i5',
      'QmUGEFccxPpXx2EVWWwj98ZU3EjsUyALfBQLBmB2QrMSu8',
      'QmSMQUriiP7hMvJn7RpK2mWaXAgRvCbKkUfgh83iYZ1wNU',
      'Qmc5ZxCYQJvuwPynda8akcqJymNbL8YdNCT6WXry7DkgtJ')
  );`)

  pgm.sql(` DELETE FROM content_files
  WHERE
  deployment = ANY (
    SELECT id FROM deployments as e
    WHERE
    e.entity_id IN ('QmXVu6DMfRbVrzGFVbjNhKik8H4hE5X7yFFf4cWCGpZ6CL',
      'QmbAMNjND7rPZyMBX8yWyvTod9a1zvbhXDRnT9jyJiz4Md',
      'QmR1bYDjkfgAwagtp4qQPnKosWUU6mMGnWeYhf29T2zwe7',
      'QmcfZ7PBZQeoom9LD1AjvjwJZyXdugo3a37jGW2jPJYGSi',
      'QmdBL5BSsH71RPFCSDVuQjBgDB75MaFD1129t13LLwU7Uo',
      'QmW41RH1q6cNeXt1HGoX5ALk36svRrpgtrQMk4fhHkz8Q8',
      'QmUt14KwbLQ8jmwYSUPqbPkFQbU8ndMXhjoyFPX44DijEP',
      'QmTjFHnepcu5NSTcofCZzpkVmkLkApBzKiDqa18xdek8Gg',
      'QmVttiMyAu2FXwfLHDSbWZRQeXKA8NU3gqBi39ETFLK4i5',
      'QmUGEFccxPpXx2EVWWwj98ZU3EjsUyALfBQLBmB2QrMSu8',
      'QmSMQUriiP7hMvJn7RpK2mWaXAgRvCbKkUfgh83iYZ1wNU',
      'Qmc5ZxCYQJvuwPynda8akcqJymNbL8YdNCT6WXry7DkgtJ')
  );`)

  pgm.sql(`DELETE FROM deployments
  WHERE entity_id IN ('QmXVu6DMfRbVrzGFVbjNhKik8H4hE5X7yFFf4cWCGpZ6CL',
      'QmbAMNjND7rPZyMBX8yWyvTod9a1zvbhXDRnT9jyJiz4Md',
      'QmR1bYDjkfgAwagtp4qQPnKosWUU6mMGnWeYhf29T2zwe7',
      'QmcfZ7PBZQeoom9LD1AjvjwJZyXdugo3a37jGW2jPJYGSi',
      'QmdBL5BSsH71RPFCSDVuQjBgDB75MaFD1129t13LLwU7Uo',
      'QmW41RH1q6cNeXt1HGoX5ALk36svRrpgtrQMk4fhHkz8Q8',
      'QmUt14KwbLQ8jmwYSUPqbPkFQbU8ndMXhjoyFPX44DijEP',
      'QmTjFHnepcu5NSTcofCZzpkVmkLkApBzKiDqa18xdek8Gg',
      'QmVttiMyAu2FXwfLHDSbWZRQeXKA8NU3gqBi39ETFLK4i5',
      'QmUGEFccxPpXx2EVWWwj98ZU3EjsUyALfBQLBmB2QrMSu8',
      'QmSMQUriiP7hMvJn7RpK2mWaXAgRvCbKkUfgh83iYZ1wNU',
      'Qmc5ZxCYQJvuwPynda8akcqJymNbL8YdNCT6WXry7DkgtJ');`)

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

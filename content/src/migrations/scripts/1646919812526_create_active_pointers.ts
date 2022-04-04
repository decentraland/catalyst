import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('active_pointers', {
    pointer: { type: 'text', primaryKey: true },
    entity_id: { type: 'text', notNull: true }
  })

  // Delete invalid deployments:
  // PROD:
  // 'Qma8DraR8JPfMfa9v9Eeh1fFkJpJ8iXYLTWPMg9xcRHW61',
  // 'QmWWtbpt632GkuUjX3yzdYB1FrNCYAU2fU2thFtEJPWi36',
  // 'QmfFpN49XtjmcsCFchqmjyXXNX4t3d8URE2i9QA9NuzULE',
  // 'QmTtjevvkarvaww3v7a9QXuSxkuc8YJyiX9VKW3Tmcg1qz',
  // 'QmSdgEPNT1CdEacagdTjqPgPGFnQXXVpgVmVeYQNC8JYDz',
  // 'QmS4m3BPZKAbdpuqCPy9ag1oeSvTXgL1CNNnjq7Gj8hAjb',
  // 'QmXe1AFCEeTdR4HispiiW9Dkx7QcSyFBVA4AyvJuVnVswV',
  // 'QmZWDaegoUhr4oMuB4Vd8FwPrAahjkqPB3RrtPJGmZCvMX',
  // 'QmfNVq56ucaCcgXg7fBLacrm9M6Td5rP7HkTt27SK2wGic',
  // 'QmbxtmCNzCtAwPt6sg9XGgkcuf4Ugoa7NYf1Bqb2FZxYnQ',
  // 'QmdxZnvwdrpN5T7k7qQDeKBoaSnckB8moMAgQJUtaXh8D3',
  // 'QmT6EVGKs4xGQWp3XXioZJCThf8ebFopdhRCpbGG7P3iz9',
  // 'QmPjVyfo4euciWPt4H6ABVVaFfmadb5fTQt92GfZBwFVH1',
  // 'QmasZ5WL4TvtRfoWB4CJ9BHo75G7uFh2bGTpphFi8WcHao',
  // 'QmYgsjNDKzoCLtmhGfWnoXHbKtpJ3hjsqSktKwSN14NGRt',
  // 'Qmex6oPwGLQTPuLERuMzx3uBsz3T6kieSV2foxVH3HRQ3N',
  // 'QmSrstKVzaYA4NFPCcRxwgnsmqbr7Z9D7qWiMmCZz8mCb8',
  // 'QmTN4VzJYnabWAafkgqScnvqeQ3VD3hj9W7jnxBN6e2gdJ',
  // 'QmecbenQT8VJHHg86pLvr6khHrEFaCwK6T2jMHFg85eLAR',
  // 'QmR9SXZHvUVTYLnRsnTyHaovRBq4cTtoudYapKtErhmaB3',
  // 'QmfBQHZUaGmcGtpy8bbq9gFK4iXdWdpikWt61VcgA25kW3',
  // 'QmZDsE3zwmhin3p4DP5niQDGHxXBXJ4YZsDehj8K751JHi',
  // 'QmbPu37FBPQVWWmKoCUZf11HrzDvuaKXYJ3dXeK8SzhvfZ',
  // 'QmXGmrqWiicDGxgJgonfzfpvegeACYxdqauc5NFykC9JRi',
  // 'QmX5HsazaYxox9NmCYHMKwRwMRiXDC7qWsrySXMid5gdTH',
  // 'Qmd2nKrPjSZB4FWsXEWSwkRJJ37iEEVr7NoGnqkdcacVNe',
  // 'QmVtZMLjqh5NarHno6dua9mbLWC6ZzFuTJLHvp1hXmYD39',
  // 'QmfVr3wwfqiKqVbA8yW4buMqD215kPRdQrAFhhoQ8RENtY',
  // 'QmUN62XUhMuZb5GeviCZ3v9H3H1ZE3cbYJASqH4Fdh1hSP',
  // 'QmRJhrvSRWYx2WD9yWcwNekCgRSaoSMfWcubDS4pSi1tJR',
  // 'Qmccax3RmwcBMyzUiAGDXLiNJ11BgJke2RZEBqTxjrNDfu',
  // 'QmQJJA5rVujKKqvYdCfxUJUUYJ1AckW2AQCEhM7ARUynME',
  // 'QmQnYCXDfwhRGzbSbBGZe74cbq9J6EqHGSicfDQQeDwSNk',
  // 'Qmf37Pxcb8eARo8g95ewmZfaWcRvTXSPoTfYsQ9cYfXVhD',
  // 'Qmcv1XgwxXJLdL446zJ47fLxejtZD4YBBRBn3xoc8y91nG',
  // 'QmRSZm14GtxRA2zTdRVVJfty636SWEGXtmnn1TvxXBKH5f',
  // 'QmfYK2ahm6G3vaddsQJx1u3hGJPPjAe2F2fQdhuCLM5xej',
  // 'Qmf1KgiErAcEEMAxCpGYjn2rm2aLcqCHrax2ex2HykWj3W',
  // 'QmfYt8cDcNHqrdLYSNPZCCeQF9sj2n9qPTxQhSY16Srow5',
  // 'QmSCR66NTA79DrjojcHf1sRHjHqH4RLWPK1jSrnxrYufqa'

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
      'Qmc5ZxCYQJvuwPynda8akcqJymNbL8YdNCT6WXry7DkgtJ',
      'Qmb4Xob2q1ZkR5Rv1xjEboGJDWyvHBRAquqBePSKdJ5Dgp',
      'QmXjDTMC6U56zBAhUKkLCcDtFcL57KD5RsneQcpa3Rj7uF',
      'QmUTkE6jc5NVez5yaUwa2ifKvVr9WUrPKHuGM9xDaNtvix',
      'QmRCLX5u6o2qdoFx1pEHdkQzeqQnWy4VkVz3jSeNYKSpc8',
      'QmeaQqpuiR3XZFe4DQsR82Zs4Hb66E5xTCgUfLDDQUKMVy',
      'QmRq6ZRtZKAmqewY2an7c4Qyesity9sGgVqhacPxKxP661',
      'QmYp7yE7tA9PCS1G247V34aDcr2yKBiYXxTdRUfYBUV7AE',
      'QmXjVjWKZCQr9Vh5vLk5Qr8rnb1kqY9kBKpLkEA4DBrr96',
      'Qme3qoQnwVZCHjyZpFvCbsPLsUyaYGLufkAa8RrcFVRv45',
      'QmVDm8eY5dN9mgwrcvhW9ESxyeHoKooTZTD2WJkuxDFKm8',
      'QmbqUJgPnXnHauSLvHSFwp21wDsWaA2e6rYfZ5Ze3hmALE',
      'QmWoneq3dsepicm7VG8tQvWmzdpUDJJUTVjqtiw23jjad3',
      'QmcC1aehCxtFdSZp2J4QYF8MSQ2XbfUbQtjnL26GtZrmHN',
      'QmbcnDvPpZAnLaRVhMBqkYvaQpm1fsxwCGBsggnywpvrrW',
      'QmUA6HraWEeKGgBMTxMhAmkyJF4UgL3hVLrm7Pxwrcvagy',
      'QmRCLX5u6o2qdoFx1pEHdkQzeqQnWy4VkVz3jSeNYKSpc8',
      'Qmb4Xob2q1ZkR5Rv1xjEboGJDWyvHBRAquqBePSKdJ5Dgp',
      'QmUTkE6jc5NVez5yaUwa2ifKvVr9WUrPKHuGM9xDaNtvix',
      'QmdHPqMt17mritBwbwSr4aD5hW24qir6RfrtpRJj6zPNy7',
      'Qmd7PpbYwP7DbeiviunnkSiTp69e3V6frXnFvzvmgNctBj',
      'QmZ53yGgADRTo2abtjjcswbrg2EzKMm2m7iggFi7ivNS31',
      'QmRq6ZRtZKAmqewY2an7c4Qyesity9sGgVqhacPxKxP661',
      'QmeaQqpuiR3XZFe4DQsR82Zs4Hb66E5xTCgUfLDDQUKMVy',
      'QmQGtPd8yRGurJ3cBYj8ryTvRF9hpspuS8gzFfFBsnnBxQ',
      'QmQkY8DfktrsE2B9Dqopm1mbb5HHaUJgrmYkGdP6dJzmHz',
      'QmeCQ3RDtQ5fvirdwmU8wnyidt76xafZGUyviRn2EpV5DT',
      'QmVZzTQd4iG77fBJJCu4YLybkxpvkyxoMM1Bez1Rss9nay',
      'QmTm6PSypbMkyH6atfEVUH8y8VtXEYX5zeedEj9dqZnF4c',
      'QmeaqVd9MZqvFBXV8C2k7DG289kPhLu2iUkswsRSLdPMvX',
      'QmXjDTMC6U56zBAhUKkLCcDtFcL57KD5RsneQcpa3Rj7uF')
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
      'Qmc5ZxCYQJvuwPynda8akcqJymNbL8YdNCT6WXry7DkgtJ',
      'Qmb4Xob2q1ZkR5Rv1xjEboGJDWyvHBRAquqBePSKdJ5Dgp',
      'QmXjDTMC6U56zBAhUKkLCcDtFcL57KD5RsneQcpa3Rj7uF',
      'QmUTkE6jc5NVez5yaUwa2ifKvVr9WUrPKHuGM9xDaNtvix',
      'QmRCLX5u6o2qdoFx1pEHdkQzeqQnWy4VkVz3jSeNYKSpc8',
      'QmeaQqpuiR3XZFe4DQsR82Zs4Hb66E5xTCgUfLDDQUKMVy',
      'QmRq6ZRtZKAmqewY2an7c4Qyesity9sGgVqhacPxKxP661',
      'QmYp7yE7tA9PCS1G247V34aDcr2yKBiYXxTdRUfYBUV7AE',
      'QmXjVjWKZCQr9Vh5vLk5Qr8rnb1kqY9kBKpLkEA4DBrr96',
      'Qme3qoQnwVZCHjyZpFvCbsPLsUyaYGLufkAa8RrcFVRv45',
      'QmVDm8eY5dN9mgwrcvhW9ESxyeHoKooTZTD2WJkuxDFKm8',
      'QmbqUJgPnXnHauSLvHSFwp21wDsWaA2e6rYfZ5Ze3hmALE',
      'QmWoneq3dsepicm7VG8tQvWmzdpUDJJUTVjqtiw23jjad3',
      'QmcC1aehCxtFdSZp2J4QYF8MSQ2XbfUbQtjnL26GtZrmHN',
      'QmbcnDvPpZAnLaRVhMBqkYvaQpm1fsxwCGBsggnywpvrrW',
      'QmUA6HraWEeKGgBMTxMhAmkyJF4UgL3hVLrm7Pxwrcvagy',
      'QmRCLX5u6o2qdoFx1pEHdkQzeqQnWy4VkVz3jSeNYKSpc8',
      'Qmb4Xob2q1ZkR5Rv1xjEboGJDWyvHBRAquqBePSKdJ5Dgp',
      'QmUTkE6jc5NVez5yaUwa2ifKvVr9WUrPKHuGM9xDaNtvix',
      'QmdHPqMt17mritBwbwSr4aD5hW24qir6RfrtpRJj6zPNy7',
      'Qmd7PpbYwP7DbeiviunnkSiTp69e3V6frXnFvzvmgNctBj',
      'QmZ53yGgADRTo2abtjjcswbrg2EzKMm2m7iggFi7ivNS31',
      'QmRq6ZRtZKAmqewY2an7c4Qyesity9sGgVqhacPxKxP661',
      'QmeaQqpuiR3XZFe4DQsR82Zs4Hb66E5xTCgUfLDDQUKMVy',
      'QmQGtPd8yRGurJ3cBYj8ryTvRF9hpspuS8gzFfFBsnnBxQ',
      'QmQkY8DfktrsE2B9Dqopm1mbb5HHaUJgrmYkGdP6dJzmHz',
      'QmeCQ3RDtQ5fvirdwmU8wnyidt76xafZGUyviRn2EpV5DT',
      'QmVZzTQd4iG77fBJJCu4YLybkxpvkyxoMM1Bez1Rss9nay',
      'QmTm6PSypbMkyH6atfEVUH8y8VtXEYX5zeedEj9dqZnF4c',
      'QmeaqVd9MZqvFBXV8C2k7DG289kPhLu2iUkswsRSLdPMvX',
      'QmXjDTMC6U56zBAhUKkLCcDtFcL57KD5RsneQcpa3Rj7uF')
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
      'Qmc5ZxCYQJvuwPynda8akcqJymNbL8YdNCT6WXry7DkgtJ',
      'Qmb4Xob2q1ZkR5Rv1xjEboGJDWyvHBRAquqBePSKdJ5Dgp',
      'QmXjDTMC6U56zBAhUKkLCcDtFcL57KD5RsneQcpa3Rj7uF',
      'QmUTkE6jc5NVez5yaUwa2ifKvVr9WUrPKHuGM9xDaNtvix',
      'QmRCLX5u6o2qdoFx1pEHdkQzeqQnWy4VkVz3jSeNYKSpc8',
      'QmeaQqpuiR3XZFe4DQsR82Zs4Hb66E5xTCgUfLDDQUKMVy',
      'QmRq6ZRtZKAmqewY2an7c4Qyesity9sGgVqhacPxKxP661',
      'QmYp7yE7tA9PCS1G247V34aDcr2yKBiYXxTdRUfYBUV7AE',
      'QmXjVjWKZCQr9Vh5vLk5Qr8rnb1kqY9kBKpLkEA4DBrr96',
      'Qme3qoQnwVZCHjyZpFvCbsPLsUyaYGLufkAa8RrcFVRv45',
      'QmVDm8eY5dN9mgwrcvhW9ESxyeHoKooTZTD2WJkuxDFKm8',
      'QmbqUJgPnXnHauSLvHSFwp21wDsWaA2e6rYfZ5Ze3hmALE',
      'QmWoneq3dsepicm7VG8tQvWmzdpUDJJUTVjqtiw23jjad3',
      'QmcC1aehCxtFdSZp2J4QYF8MSQ2XbfUbQtjnL26GtZrmHN',
      'QmbcnDvPpZAnLaRVhMBqkYvaQpm1fsxwCGBsggnywpvrrW',
      'QmUA6HraWEeKGgBMTxMhAmkyJF4UgL3hVLrm7Pxwrcvagy',
      'QmRCLX5u6o2qdoFx1pEHdkQzeqQnWy4VkVz3jSeNYKSpc8',
      'Qmb4Xob2q1ZkR5Rv1xjEboGJDWyvHBRAquqBePSKdJ5Dgp',
      'QmUTkE6jc5NVez5yaUwa2ifKvVr9WUrPKHuGM9xDaNtvix',
      'QmdHPqMt17mritBwbwSr4aD5hW24qir6RfrtpRJj6zPNy7',
      'Qmd7PpbYwP7DbeiviunnkSiTp69e3V6frXnFvzvmgNctBj',
      'QmZ53yGgADRTo2abtjjcswbrg2EzKMm2m7iggFi7ivNS31',
      'QmRq6ZRtZKAmqewY2an7c4Qyesity9sGgVqhacPxKxP661',
      'QmeaQqpuiR3XZFe4DQsR82Zs4Hb66E5xTCgUfLDDQUKMVy',
      'QmQGtPd8yRGurJ3cBYj8ryTvRF9hpspuS8gzFfFBsnnBxQ',
      'QmQkY8DfktrsE2B9Dqopm1mbb5HHaUJgrmYkGdP6dJzmHz',
      'QmeCQ3RDtQ5fvirdwmU8wnyidt76xafZGUyviRn2EpV5DT',
      'QmVZzTQd4iG77fBJJCu4YLybkxpvkyxoMM1Bez1Rss9nay',
      'QmTm6PSypbMkyH6atfEVUH8y8VtXEYX5zeedEj9dqZnF4c',
      'QmeaqVd9MZqvFBXV8C2k7DG289kPhLu2iUkswsRSLdPMvX',
      'QmXjDTMC6U56zBAhUKkLCcDtFcL57KD5RsneQcpa3Rj7uF')
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
      'Qmc5ZxCYQJvuwPynda8akcqJymNbL8YdNCT6WXry7DkgtJ',
      'Qmb4Xob2q1ZkR5Rv1xjEboGJDWyvHBRAquqBePSKdJ5Dgp',
      'QmXjDTMC6U56zBAhUKkLCcDtFcL57KD5RsneQcpa3Rj7uF',
      'QmUTkE6jc5NVez5yaUwa2ifKvVr9WUrPKHuGM9xDaNtvix',
      'QmRCLX5u6o2qdoFx1pEHdkQzeqQnWy4VkVz3jSeNYKSpc8',
      'QmeaQqpuiR3XZFe4DQsR82Zs4Hb66E5xTCgUfLDDQUKMVy',
      'QmRq6ZRtZKAmqewY2an7c4Qyesity9sGgVqhacPxKxP661',
      'QmYp7yE7tA9PCS1G247V34aDcr2yKBiYXxTdRUfYBUV7AE',
      'QmXjVjWKZCQr9Vh5vLk5Qr8rnb1kqY9kBKpLkEA4DBrr96',
      'Qme3qoQnwVZCHjyZpFvCbsPLsUyaYGLufkAa8RrcFVRv45',
      'QmVDm8eY5dN9mgwrcvhW9ESxyeHoKooTZTD2WJkuxDFKm8',
      'QmbqUJgPnXnHauSLvHSFwp21wDsWaA2e6rYfZ5Ze3hmALE',
      'QmWoneq3dsepicm7VG8tQvWmzdpUDJJUTVjqtiw23jjad3',
      'QmcC1aehCxtFdSZp2J4QYF8MSQ2XbfUbQtjnL26GtZrmHN',
      'QmbcnDvPpZAnLaRVhMBqkYvaQpm1fsxwCGBsggnywpvrrW',
      'QmUA6HraWEeKGgBMTxMhAmkyJF4UgL3hVLrm7Pxwrcvagy',
      'QmRCLX5u6o2qdoFx1pEHdkQzeqQnWy4VkVz3jSeNYKSpc8',
      'Qmb4Xob2q1ZkR5Rv1xjEboGJDWyvHBRAquqBePSKdJ5Dgp',
      'QmUTkE6jc5NVez5yaUwa2ifKvVr9WUrPKHuGM9xDaNtvix',
      'QmdHPqMt17mritBwbwSr4aD5hW24qir6RfrtpRJj6zPNy7',
      'Qmd7PpbYwP7DbeiviunnkSiTp69e3V6frXnFvzvmgNctBj',
      'QmZ53yGgADRTo2abtjjcswbrg2EzKMm2m7iggFi7ivNS31',
      'QmRq6ZRtZKAmqewY2an7c4Qyesity9sGgVqhacPxKxP661',
      'QmeaQqpuiR3XZFe4DQsR82Zs4Hb66E5xTCgUfLDDQUKMVy',
      'QmQGtPd8yRGurJ3cBYj8ryTvRF9hpspuS8gzFfFBsnnBxQ',
      'QmQkY8DfktrsE2B9Dqopm1mbb5HHaUJgrmYkGdP6dJzmHz',
      'QmeCQ3RDtQ5fvirdwmU8wnyidt76xafZGUyviRn2EpV5DT',
      'QmVZzTQd4iG77fBJJCu4YLybkxpvkyxoMM1Bez1Rss9nay',
      'QmTm6PSypbMkyH6atfEVUH8y8VtXEYX5zeedEj9dqZnF4c',
      'QmeaqVd9MZqvFBXV8C2k7DG289kPhLu2iUkswsRSLdPMvX',
      'QmXjDTMC6U56zBAhUKkLCcDtFcL57KD5RsneQcpa3Rj7uF')
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
      'Qmc5ZxCYQJvuwPynda8akcqJymNbL8YdNCT6WXry7DkgtJ',
      'Qmb4Xob2q1ZkR5Rv1xjEboGJDWyvHBRAquqBePSKdJ5Dgp',
      'QmXjDTMC6U56zBAhUKkLCcDtFcL57KD5RsneQcpa3Rj7uF',
      'QmUTkE6jc5NVez5yaUwa2ifKvVr9WUrPKHuGM9xDaNtvix',
      'QmRCLX5u6o2qdoFx1pEHdkQzeqQnWy4VkVz3jSeNYKSpc8',
      'QmeaQqpuiR3XZFe4DQsR82Zs4Hb66E5xTCgUfLDDQUKMVy',
      'QmRq6ZRtZKAmqewY2an7c4Qyesity9sGgVqhacPxKxP661',
      'QmYp7yE7tA9PCS1G247V34aDcr2yKBiYXxTdRUfYBUV7AE',
      'QmXjVjWKZCQr9Vh5vLk5Qr8rnb1kqY9kBKpLkEA4DBrr96',
      'Qme3qoQnwVZCHjyZpFvCbsPLsUyaYGLufkAa8RrcFVRv45',
      'QmVDm8eY5dN9mgwrcvhW9ESxyeHoKooTZTD2WJkuxDFKm8',
      'QmbqUJgPnXnHauSLvHSFwp21wDsWaA2e6rYfZ5Ze3hmALE',
      'QmWoneq3dsepicm7VG8tQvWmzdpUDJJUTVjqtiw23jjad3',
      'QmcC1aehCxtFdSZp2J4QYF8MSQ2XbfUbQtjnL26GtZrmHN',
      'QmbcnDvPpZAnLaRVhMBqkYvaQpm1fsxwCGBsggnywpvrrW',
      'QmUA6HraWEeKGgBMTxMhAmkyJF4UgL3hVLrm7Pxwrcvagy',
      'QmRCLX5u6o2qdoFx1pEHdkQzeqQnWy4VkVz3jSeNYKSpc8',
      'Qmb4Xob2q1ZkR5Rv1xjEboGJDWyvHBRAquqBePSKdJ5Dgp',
      'QmUTkE6jc5NVez5yaUwa2ifKvVr9WUrPKHuGM9xDaNtvix',
      'QmdHPqMt17mritBwbwSr4aD5hW24qir6RfrtpRJj6zPNy7',
      'Qmd7PpbYwP7DbeiviunnkSiTp69e3V6frXnFvzvmgNctBj',
      'QmZ53yGgADRTo2abtjjcswbrg2EzKMm2m7iggFi7ivNS31',
      'QmRq6ZRtZKAmqewY2an7c4Qyesity9sGgVqhacPxKxP661',
      'QmeaQqpuiR3XZFe4DQsR82Zs4Hb66E5xTCgUfLDDQUKMVy',
      'QmQGtPd8yRGurJ3cBYj8ryTvRF9hpspuS8gzFfFBsnnBxQ',
      'QmQkY8DfktrsE2B9Dqopm1mbb5HHaUJgrmYkGdP6dJzmHz',
      'QmeCQ3RDtQ5fvirdwmU8wnyidt76xafZGUyviRn2EpV5DT',
      'QmVZzTQd4iG77fBJJCu4YLybkxpvkyxoMM1Bez1Rss9nay',
      'QmTm6PSypbMkyH6atfEVUH8y8VtXEYX5zeedEj9dqZnF4c',
      'QmeaqVd9MZqvFBXV8C2k7DG289kPhLu2iUkswsRSLdPMvX',
      'QmXjDTMC6U56zBAhUKkLCcDtFcL57KD5RsneQcpa3Rj7uF');`)

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

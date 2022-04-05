import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('active_pointers', {
    pointer: { type: 'text', primaryKey: true },
    entity_id: { type: 'text', notNull: true }
  })
  pgm.sql(`CREATE EXTENSION pg_trgm;`)
  pgm.sql(`CREATE INDEX active_pointers_pointer_ops ON active_pointers USING gin (pointer gin_trgm_ops);`)

  pgm.sql(`DELETE FROM deployment_deltas
  WHERE
  deployment = ANY (
    SELECT id FROM deployments as e
    WHERE
    e.entity_id IN ('Qma8DraR8JPfMfa9v9Eeh1fFkJpJ8iXYLTWPMg9xcRHW61',
      'QmWWtbpt632GkuUjX3yzdYB1FrNCYAU2fU2thFtEJPWi36',
      'QmfFpN49XtjmcsCFchqmjyXXNX4t3d8URE2i9QA9NuzULE',
      'QmTtjevvkarvaww3v7a9QXuSxkuc8YJyiX9VKW3Tmcg1qz',
      'QmSdgEPNT1CdEacagdTjqPgPGFnQXXVpgVmVeYQNC8JYDz',
      'QmS4m3BPZKAbdpuqCPy9ag1oeSvTXgL1CNNnjq7Gj8hAjb',
      'QmXe1AFCEeTdR4HispiiW9Dkx7QcSyFBVA4AyvJuVnVswV',
      'QmZWDaegoUhr4oMuB4Vd8FwPrAahjkqPB3RrtPJGmZCvMX',
      'QmfNVq56ucaCcgXg7fBLacrm9M6Td5rP7HkTt27SK2wGic',
      'QmbxtmCNzCtAwPt6sg9XGgkcuf4Ugoa7NYf1Bqb2FZxYnQ',
      'QmdxZnvwdrpN5T7k7qQDeKBoaSnckB8moMAgQJUtaXh8D3',
      'QmT6EVGKs4xGQWp3XXioZJCThf8ebFopdhRCpbGG7P3iz9',
      'QmPjVyfo4euciWPt4H6ABVVaFfmadb5fTQt92GfZBwFVH1',
      'QmasZ5WL4TvtRfoWB4CJ9BHo75G7uFh2bGTpphFi8WcHao',
      'QmYgsjNDKzoCLtmhGfWnoXHbKtpJ3hjsqSktKwSN14NGRt',
      'Qmex6oPwGLQTPuLERuMzx3uBsz3T6kieSV2foxVH3HRQ3N',
      'QmSrstKVzaYA4NFPCcRxwgnsmqbr7Z9D7qWiMmCZz8mCb8',
      'QmTN4VzJYnabWAafkgqScnvqeQ3VD3hj9W7jnxBN6e2gdJ',
      'QmecbenQT8VJHHg86pLvr6khHrEFaCwK6T2jMHFg85eLAR',
      'QmR9SXZHvUVTYLnRsnTyHaovRBq4cTtoudYapKtErhmaB3',
      'QmfBQHZUaGmcGtpy8bbq9gFK4iXdWdpikWt61VcgA25kW3',
      'QmZDsE3zwmhin3p4DP5niQDGHxXBXJ4YZsDehj8K751JHi',
      'QmbPu37FBPQVWWmKoCUZf11HrzDvuaKXYJ3dXeK8SzhvfZ',
      'QmXGmrqWiicDGxgJgonfzfpvegeACYxdqauc5NFykC9JRi',
      'QmX5HsazaYxox9NmCYHMKwRwMRiXDC7qWsrySXMid5gdTH',
      'Qmd2nKrPjSZB4FWsXEWSwkRJJ37iEEVr7NoGnqkdcacVNe',
      'QmVtZMLjqh5NarHno6dua9mbLWC6ZzFuTJLHvp1hXmYD39',
      'QmfVr3wwfqiKqVbA8yW4buMqD215kPRdQrAFhhoQ8RENtY',
      'QmUN62XUhMuZb5GeviCZ3v9H3H1ZE3cbYJASqH4Fdh1hSP',
      'QmRJhrvSRWYx2WD9yWcwNekCgRSaoSMfWcubDS4pSi1tJR',
      'Qmccax3RmwcBMyzUiAGDXLiNJ11BgJke2RZEBqTxjrNDfu',
      'QmQJJA5rVujKKqvYdCfxUJUUYJ1AckW2AQCEhM7ARUynME',
      'QmQnYCXDfwhRGzbSbBGZe74cbq9J6EqHGSicfDQQeDwSNk',
      'Qmf37Pxcb8eARo8g95ewmZfaWcRvTXSPoTfYsQ9cYfXVhD',
      'Qmcv1XgwxXJLdL446zJ47fLxejtZD4YBBRBn3xoc8y91nG',
      'QmRSZm14GtxRA2zTdRVVJfty636SWEGXtmnn1TvxXBKH5f',
      'QmfYK2ahm6G3vaddsQJx1u3hGJPPjAe2F2fQdhuCLM5xej',
      'Qmf1KgiErAcEEMAxCpGYjn2rm2aLcqCHrax2ex2HykWj3W',
      'QmfYt8cDcNHqrdLYSNPZCCeQF9sj2n9qPTxQhSY16Srow5',
      'QmSCR66NTA79DrjojcHf1sRHjHqH4RLWPK1jSrnxrYufqa')
  );`)

  pgm.sql(`DELETE FROM last_deployed_pointers
  WHERE
  deployment = ANY (
    SELECT id FROM deployments as e
    WHERE
    e.entity_id IN ('Qma8DraR8JPfMfa9v9Eeh1fFkJpJ8iXYLTWPMg9xcRHW61',
      'QmWWtbpt632GkuUjX3yzdYB1FrNCYAU2fU2thFtEJPWi36',
      'QmfFpN49XtjmcsCFchqmjyXXNX4t3d8URE2i9QA9NuzULE',
      'QmTtjevvkarvaww3v7a9QXuSxkuc8YJyiX9VKW3Tmcg1qz',
      'QmSdgEPNT1CdEacagdTjqPgPGFnQXXVpgVmVeYQNC8JYDz',
      'QmS4m3BPZKAbdpuqCPy9ag1oeSvTXgL1CNNnjq7Gj8hAjb',
      'QmXe1AFCEeTdR4HispiiW9Dkx7QcSyFBVA4AyvJuVnVswV',
      'QmZWDaegoUhr4oMuB4Vd8FwPrAahjkqPB3RrtPJGmZCvMX',
      'QmfNVq56ucaCcgXg7fBLacrm9M6Td5rP7HkTt27SK2wGic',
      'QmbxtmCNzCtAwPt6sg9XGgkcuf4Ugoa7NYf1Bqb2FZxYnQ',
      'QmdxZnvwdrpN5T7k7qQDeKBoaSnckB8moMAgQJUtaXh8D3',
      'QmT6EVGKs4xGQWp3XXioZJCThf8ebFopdhRCpbGG7P3iz9',
      'QmPjVyfo4euciWPt4H6ABVVaFfmadb5fTQt92GfZBwFVH1',
      'QmasZ5WL4TvtRfoWB4CJ9BHo75G7uFh2bGTpphFi8WcHao',
      'QmYgsjNDKzoCLtmhGfWnoXHbKtpJ3hjsqSktKwSN14NGRt',
      'Qmex6oPwGLQTPuLERuMzx3uBsz3T6kieSV2foxVH3HRQ3N',
      'QmSrstKVzaYA4NFPCcRxwgnsmqbr7Z9D7qWiMmCZz8mCb8',
      'QmTN4VzJYnabWAafkgqScnvqeQ3VD3hj9W7jnxBN6e2gdJ',
      'QmecbenQT8VJHHg86pLvr6khHrEFaCwK6T2jMHFg85eLAR',
      'QmR9SXZHvUVTYLnRsnTyHaovRBq4cTtoudYapKtErhmaB3',
      'QmfBQHZUaGmcGtpy8bbq9gFK4iXdWdpikWt61VcgA25kW3',
      'QmZDsE3zwmhin3p4DP5niQDGHxXBXJ4YZsDehj8K751JHi',
      'QmbPu37FBPQVWWmKoCUZf11HrzDvuaKXYJ3dXeK8SzhvfZ',
      'QmXGmrqWiicDGxgJgonfzfpvegeACYxdqauc5NFykC9JRi',
      'QmX5HsazaYxox9NmCYHMKwRwMRiXDC7qWsrySXMid5gdTH',
      'Qmd2nKrPjSZB4FWsXEWSwkRJJ37iEEVr7NoGnqkdcacVNe',
      'QmVtZMLjqh5NarHno6dua9mbLWC6ZzFuTJLHvp1hXmYD39',
      'QmfVr3wwfqiKqVbA8yW4buMqD215kPRdQrAFhhoQ8RENtY',
      'QmUN62XUhMuZb5GeviCZ3v9H3H1ZE3cbYJASqH4Fdh1hSP',
      'QmRJhrvSRWYx2WD9yWcwNekCgRSaoSMfWcubDS4pSi1tJR',
      'Qmccax3RmwcBMyzUiAGDXLiNJ11BgJke2RZEBqTxjrNDfu',
      'QmQJJA5rVujKKqvYdCfxUJUUYJ1AckW2AQCEhM7ARUynME',
      'QmQnYCXDfwhRGzbSbBGZe74cbq9J6EqHGSicfDQQeDwSNk',
      'Qmf37Pxcb8eARo8g95ewmZfaWcRvTXSPoTfYsQ9cYfXVhD',
      'Qmcv1XgwxXJLdL446zJ47fLxejtZD4YBBRBn3xoc8y91nG',
      'QmRSZm14GtxRA2zTdRVVJfty636SWEGXtmnn1TvxXBKH5f',
      'QmfYK2ahm6G3vaddsQJx1u3hGJPPjAe2F2fQdhuCLM5xej',
      'Qmf1KgiErAcEEMAxCpGYjn2rm2aLcqCHrax2ex2HykWj3W',
      'QmfYt8cDcNHqrdLYSNPZCCeQF9sj2n9qPTxQhSY16Srow5',
      'QmSCR66NTA79DrjojcHf1sRHjHqH4RLWPK1jSrnxrYufqa')
  );`)

  pgm.sql(`DELETE FROM pointer_history
  WHERE
  deployment = ANY (
    SELECT id FROM deployments as e
    WHERE
    e.entity_id IN ('Qma8DraR8JPfMfa9v9Eeh1fFkJpJ8iXYLTWPMg9xcRHW61',
      'QmWWtbpt632GkuUjX3yzdYB1FrNCYAU2fU2thFtEJPWi36',
      'QmfFpN49XtjmcsCFchqmjyXXNX4t3d8URE2i9QA9NuzULE',
      'QmTtjevvkarvaww3v7a9QXuSxkuc8YJyiX9VKW3Tmcg1qz',
      'QmSdgEPNT1CdEacagdTjqPgPGFnQXXVpgVmVeYQNC8JYDz',
      'QmS4m3BPZKAbdpuqCPy9ag1oeSvTXgL1CNNnjq7Gj8hAjb',
      'QmXe1AFCEeTdR4HispiiW9Dkx7QcSyFBVA4AyvJuVnVswV',
      'QmZWDaegoUhr4oMuB4Vd8FwPrAahjkqPB3RrtPJGmZCvMX',
      'QmfNVq56ucaCcgXg7fBLacrm9M6Td5rP7HkTt27SK2wGic',
      'QmbxtmCNzCtAwPt6sg9XGgkcuf4Ugoa7NYf1Bqb2FZxYnQ',
      'QmdxZnvwdrpN5T7k7qQDeKBoaSnckB8moMAgQJUtaXh8D3',
      'QmT6EVGKs4xGQWp3XXioZJCThf8ebFopdhRCpbGG7P3iz9',
      'QmPjVyfo4euciWPt4H6ABVVaFfmadb5fTQt92GfZBwFVH1',
      'QmasZ5WL4TvtRfoWB4CJ9BHo75G7uFh2bGTpphFi8WcHao',
      'QmYgsjNDKzoCLtmhGfWnoXHbKtpJ3hjsqSktKwSN14NGRt',
      'Qmex6oPwGLQTPuLERuMzx3uBsz3T6kieSV2foxVH3HRQ3N',
      'QmSrstKVzaYA4NFPCcRxwgnsmqbr7Z9D7qWiMmCZz8mCb8',
      'QmTN4VzJYnabWAafkgqScnvqeQ3VD3hj9W7jnxBN6e2gdJ',
      'QmecbenQT8VJHHg86pLvr6khHrEFaCwK6T2jMHFg85eLAR',
      'QmR9SXZHvUVTYLnRsnTyHaovRBq4cTtoudYapKtErhmaB3',
      'QmfBQHZUaGmcGtpy8bbq9gFK4iXdWdpikWt61VcgA25kW3',
      'QmZDsE3zwmhin3p4DP5niQDGHxXBXJ4YZsDehj8K751JHi',
      'QmbPu37FBPQVWWmKoCUZf11HrzDvuaKXYJ3dXeK8SzhvfZ',
      'QmXGmrqWiicDGxgJgonfzfpvegeACYxdqauc5NFykC9JRi',
      'QmX5HsazaYxox9NmCYHMKwRwMRiXDC7qWsrySXMid5gdTH',
      'Qmd2nKrPjSZB4FWsXEWSwkRJJ37iEEVr7NoGnqkdcacVNe',
      'QmVtZMLjqh5NarHno6dua9mbLWC6ZzFuTJLHvp1hXmYD39',
      'QmfVr3wwfqiKqVbA8yW4buMqD215kPRdQrAFhhoQ8RENtY',
      'QmUN62XUhMuZb5GeviCZ3v9H3H1ZE3cbYJASqH4Fdh1hSP',
      'QmRJhrvSRWYx2WD9yWcwNekCgRSaoSMfWcubDS4pSi1tJR',
      'Qmccax3RmwcBMyzUiAGDXLiNJ11BgJke2RZEBqTxjrNDfu',
      'QmQJJA5rVujKKqvYdCfxUJUUYJ1AckW2AQCEhM7ARUynME',
      'QmQnYCXDfwhRGzbSbBGZe74cbq9J6EqHGSicfDQQeDwSNk',
      'Qmf37Pxcb8eARo8g95ewmZfaWcRvTXSPoTfYsQ9cYfXVhD',
      'Qmcv1XgwxXJLdL446zJ47fLxejtZD4YBBRBn3xoc8y91nG',
      'QmRSZm14GtxRA2zTdRVVJfty636SWEGXtmnn1TvxXBKH5f',
      'QmfYK2ahm6G3vaddsQJx1u3hGJPPjAe2F2fQdhuCLM5xej',
      'Qmf1KgiErAcEEMAxCpGYjn2rm2aLcqCHrax2ex2HykWj3W',
      'QmfYt8cDcNHqrdLYSNPZCCeQF9sj2n9qPTxQhSY16Srow5',
      'QmSCR66NTA79DrjojcHf1sRHjHqH4RLWPK1jSrnxrYufqa')
  );`)

  pgm.sql(`DELETE FROM content_files
  WHERE
  deployment = ANY (
    SELECT id FROM deployments as e
    WHERE
    e.entity_id IN ('Qma8DraR8JPfMfa9v9Eeh1fFkJpJ8iXYLTWPMg9xcRHW61',
      'QmWWtbpt632GkuUjX3yzdYB1FrNCYAU2fU2thFtEJPWi36',
      'QmfFpN49XtjmcsCFchqmjyXXNX4t3d8URE2i9QA9NuzULE',
      'QmTtjevvkarvaww3v7a9QXuSxkuc8YJyiX9VKW3Tmcg1qz',
      'QmSdgEPNT1CdEacagdTjqPgPGFnQXXVpgVmVeYQNC8JYDz',
      'QmS4m3BPZKAbdpuqCPy9ag1oeSvTXgL1CNNnjq7Gj8hAjb',
      'QmXe1AFCEeTdR4HispiiW9Dkx7QcSyFBVA4AyvJuVnVswV',
      'QmZWDaegoUhr4oMuB4Vd8FwPrAahjkqPB3RrtPJGmZCvMX',
      'QmfNVq56ucaCcgXg7fBLacrm9M6Td5rP7HkTt27SK2wGic',
      'QmbxtmCNzCtAwPt6sg9XGgkcuf4Ugoa7NYf1Bqb2FZxYnQ',
      'QmdxZnvwdrpN5T7k7qQDeKBoaSnckB8moMAgQJUtaXh8D3',
      'QmT6EVGKs4xGQWp3XXioZJCThf8ebFopdhRCpbGG7P3iz9',
      'QmPjVyfo4euciWPt4H6ABVVaFfmadb5fTQt92GfZBwFVH1',
      'QmasZ5WL4TvtRfoWB4CJ9BHo75G7uFh2bGTpphFi8WcHao',
      'QmYgsjNDKzoCLtmhGfWnoXHbKtpJ3hjsqSktKwSN14NGRt',
      'Qmex6oPwGLQTPuLERuMzx3uBsz3T6kieSV2foxVH3HRQ3N',
      'QmSrstKVzaYA4NFPCcRxwgnsmqbr7Z9D7qWiMmCZz8mCb8',
      'QmTN4VzJYnabWAafkgqScnvqeQ3VD3hj9W7jnxBN6e2gdJ',
      'QmecbenQT8VJHHg86pLvr6khHrEFaCwK6T2jMHFg85eLAR',
      'QmR9SXZHvUVTYLnRsnTyHaovRBq4cTtoudYapKtErhmaB3',
      'QmfBQHZUaGmcGtpy8bbq9gFK4iXdWdpikWt61VcgA25kW3',
      'QmZDsE3zwmhin3p4DP5niQDGHxXBXJ4YZsDehj8K751JHi',
      'QmbPu37FBPQVWWmKoCUZf11HrzDvuaKXYJ3dXeK8SzhvfZ',
      'QmXGmrqWiicDGxgJgonfzfpvegeACYxdqauc5NFykC9JRi',
      'QmX5HsazaYxox9NmCYHMKwRwMRiXDC7qWsrySXMid5gdTH',
      'Qmd2nKrPjSZB4FWsXEWSwkRJJ37iEEVr7NoGnqkdcacVNe',
      'QmVtZMLjqh5NarHno6dua9mbLWC6ZzFuTJLHvp1hXmYD39',
      'QmfVr3wwfqiKqVbA8yW4buMqD215kPRdQrAFhhoQ8RENtY',
      'QmUN62XUhMuZb5GeviCZ3v9H3H1ZE3cbYJASqH4Fdh1hSP',
      'QmRJhrvSRWYx2WD9yWcwNekCgRSaoSMfWcubDS4pSi1tJR',
      'Qmccax3RmwcBMyzUiAGDXLiNJ11BgJke2RZEBqTxjrNDfu',
      'QmQJJA5rVujKKqvYdCfxUJUUYJ1AckW2AQCEhM7ARUynME',
      'QmQnYCXDfwhRGzbSbBGZe74cbq9J6EqHGSicfDQQeDwSNk',
      'Qmf37Pxcb8eARo8g95ewmZfaWcRvTXSPoTfYsQ9cYfXVhD',
      'Qmcv1XgwxXJLdL446zJ47fLxejtZD4YBBRBn3xoc8y91nG',
      'QmRSZm14GtxRA2zTdRVVJfty636SWEGXtmnn1TvxXBKH5f',
      'QmfYK2ahm6G3vaddsQJx1u3hGJPPjAe2F2fQdhuCLM5xej',
      'Qmf1KgiErAcEEMAxCpGYjn2rm2aLcqCHrax2ex2HykWj3W',
      'QmfYt8cDcNHqrdLYSNPZCCeQF9sj2n9qPTxQhSY16Srow5',
      'QmSCR66NTA79DrjojcHf1sRHjHqH4RLWPK1jSrnxrYufqa')
  );`)

  pgm.sql(`DELETE FROM deployments
  WHERE entity_id IN ('Qma8DraR8JPfMfa9v9Eeh1fFkJpJ8iXYLTWPMg9xcRHW61',
      'QmWWtbpt632GkuUjX3yzdYB1FrNCYAU2fU2thFtEJPWi36',
      'QmfFpN49XtjmcsCFchqmjyXXNX4t3d8URE2i9QA9NuzULE',
      'QmTtjevvkarvaww3v7a9QXuSxkuc8YJyiX9VKW3Tmcg1qz',
      'QmSdgEPNT1CdEacagdTjqPgPGFnQXXVpgVmVeYQNC8JYDz',
      'QmS4m3BPZKAbdpuqCPy9ag1oeSvTXgL1CNNnjq7Gj8hAjb',
      'QmXe1AFCEeTdR4HispiiW9Dkx7QcSyFBVA4AyvJuVnVswV',
      'QmZWDaegoUhr4oMuB4Vd8FwPrAahjkqPB3RrtPJGmZCvMX',
      'QmfNVq56ucaCcgXg7fBLacrm9M6Td5rP7HkTt27SK2wGic',
      'QmbxtmCNzCtAwPt6sg9XGgkcuf4Ugoa7NYf1Bqb2FZxYnQ',
      'QmdxZnvwdrpN5T7k7qQDeKBoaSnckB8moMAgQJUtaXh8D3',
      'QmT6EVGKs4xGQWp3XXioZJCThf8ebFopdhRCpbGG7P3iz9',
      'QmPjVyfo4euciWPt4H6ABVVaFfmadb5fTQt92GfZBwFVH1',
      'QmasZ5WL4TvtRfoWB4CJ9BHo75G7uFh2bGTpphFi8WcHao',
      'QmYgsjNDKzoCLtmhGfWnoXHbKtpJ3hjsqSktKwSN14NGRt',
      'Qmex6oPwGLQTPuLERuMzx3uBsz3T6kieSV2foxVH3HRQ3N',
      'QmSrstKVzaYA4NFPCcRxwgnsmqbr7Z9D7qWiMmCZz8mCb8',
      'QmTN4VzJYnabWAafkgqScnvqeQ3VD3hj9W7jnxBN6e2gdJ',
      'QmecbenQT8VJHHg86pLvr6khHrEFaCwK6T2jMHFg85eLAR',
      'QmR9SXZHvUVTYLnRsnTyHaovRBq4cTtoudYapKtErhmaB3',
      'QmfBQHZUaGmcGtpy8bbq9gFK4iXdWdpikWt61VcgA25kW3',
      'QmZDsE3zwmhin3p4DP5niQDGHxXBXJ4YZsDehj8K751JHi',
      'QmbPu37FBPQVWWmKoCUZf11HrzDvuaKXYJ3dXeK8SzhvfZ',
      'QmXGmrqWiicDGxgJgonfzfpvegeACYxdqauc5NFykC9JRi',
      'QmX5HsazaYxox9NmCYHMKwRwMRiXDC7qWsrySXMid5gdTH',
      'Qmd2nKrPjSZB4FWsXEWSwkRJJ37iEEVr7NoGnqkdcacVNe',
      'QmVtZMLjqh5NarHno6dua9mbLWC6ZzFuTJLHvp1hXmYD39',
      'QmfVr3wwfqiKqVbA8yW4buMqD215kPRdQrAFhhoQ8RENtY',
      'QmUN62XUhMuZb5GeviCZ3v9H3H1ZE3cbYJASqH4Fdh1hSP',
      'QmRJhrvSRWYx2WD9yWcwNekCgRSaoSMfWcubDS4pSi1tJR',
      'Qmccax3RmwcBMyzUiAGDXLiNJ11BgJke2RZEBqTxjrNDfu',
      'QmQJJA5rVujKKqvYdCfxUJUUYJ1AckW2AQCEhM7ARUynME',
      'QmQnYCXDfwhRGzbSbBGZe74cbq9J6EqHGSicfDQQeDwSNk',
      'Qmf37Pxcb8eARo8g95ewmZfaWcRvTXSPoTfYsQ9cYfXVhD',
      'Qmcv1XgwxXJLdL446zJ47fLxejtZD4YBBRBn3xoc8y91nG',
      'QmRSZm14GtxRA2zTdRVVJfty636SWEGXtmnn1TvxXBKH5f',
      'QmfYK2ahm6G3vaddsQJx1u3hGJPPjAe2F2fQdhuCLM5xej',
      'Qmf1KgiErAcEEMAxCpGYjn2rm2aLcqCHrax2ex2HykWj3W',
      'QmfYt8cDcNHqrdLYSNPZCCeQF9sj2n9qPTxQhSY16Srow5',
      'QmSCR66NTA79DrjojcHf1sRHjHqH4RLWPK1jSrnxrYufqa');`)

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
  pgm.sql(`ALTER TABLE deployments DROP CONSTRAINT IF EXISTS deployments_uniq_entity_id;`)
  pgm.sql(`ALTER TABLE deployments ADD UNIQUE (entity_id, entity_type);`)
}

import { MigrationBuilder } from 'node-pg-migrate'
import { deleteInactiveDeploymentsFromHistory } from '../Helper'

export async function up(pgm: MigrationBuilder): Promise<void> {
  return deleteInactiveDeploymentsFromHistory(
    pgm,
    'QmX97nxQMXfPyU2NWdJQ5n14wcvaEFRVrcbVPgLua4YqFj',
    'QmPR9vrkjSAXDoVAaR5n7WHjQqQZssvCfgwtJoc19T8bPi',
    'QmXwahFWd6kcKWzuZU9ZCgY7W2xCDwygM9AbatPKMBDjp4',
    'QmQfNCQYgNxg4GURQUB1LUKEDcztYTUa9btRazy5ggBRMf',
    'QmeiCGFNg3xbqEUpUnxmcaYkgk6mmW9qkq3dRwwHeVaER2',
    'QmUgjH2fmZ43nuQAUcJrtG7uLEThjH8Spe8YCw7Ff5rcHs',
    'QmU9JciPcj8mo3p86r5i8iEQzEkj3h7BMcpE1JvfCqS9Um'
  )
}

export async function down(pgm: MigrationBuilder): Promise<void> {}

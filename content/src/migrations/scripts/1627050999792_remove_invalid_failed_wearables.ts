import { MigrationBuilder } from 'node-pg-migrate'
import { deleteFailedDeployments } from '../Helper'

export async function up(pgm: MigrationBuilder): Promise<void> {
  deleteFailedDeployments(
    pgm,
    'QmU9JciPcj8mo3p86r5i8iEQzEkj3h7BMcpE1JvfCqS9Um',
    'QmUgjH2fmZ43nuQAUcJrtG7uLEThjH8Spe8YCw7Ff5rcHs',
    'QmeiCGFNg3xbqEUpUnxmcaYkgk6mmW9qkq3dRwwHeVaER2',
    'QmX97nxQMXfPyU2NWdJQ5n14wcvaEFRVrcbVPgLua4YqFj',
    'QmQfNCQYgNxg4GURQUB1LUKEDcztYTUa9btRazy5ggBRMf',
    'QmPR9vrkjSAXDoVAaR5n7WHjQqQZssvCfgwtJoc19T8bPi',
    'QmXwahFWd6kcKWzuZU9ZCgY7W2xCDwygM9AbatPKMBDjp4'
  )
}

export async function down(pgm: MigrationBuilder): Promise<void> {}

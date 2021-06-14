import { MigrationBuilder } from 'node-pg-migrate'
import { deleteFailedDeployments } from '../Helper'

export async function up(pgm: MigrationBuilder): Promise<void> {
  deleteFailedDeployments(
    pgm,
    'QmTBPcZLFQf1rZpZg2T8nMDwWRoqeftRdvkaexgAECaqHp',
    'QmXibTSJ6wBpXiG3gc2RND9Z6k75AssvHrwpdCVZNjVGbt',
    'QmVktBsdgFSQHs68rDJCZrHQgCUFhyJ4QEiGPWivrenpcd',
    'QmaG2d2bsb4fW8En9ZUVVhjvAghSpPbfD1XSeoHrYPpn3P',
    'QmeT7cLXPPrNZk6vUis4Zut7ArXJ4rAfCh6LyMb8C4t8gA',
    'QmTjLddBe7qxyabcxCWNaYKUyro8uh76PCmB6ASKSwGtCA',
    'QmfEKyT78Pb5rAGaASLPPCyZbUn8rVY4YqKcdtRpYFVzbZ',
    'QmPiUvhZ6HkDxJLZ65t3wkwrkfEKc2NScPqnSzSZCqSfUC',
    'Qma7kh4ooweKroG5PEDgrm4dVnKuxPqBexnFkDhDVBzG4P',
    'QmUKsDTqsVnxxcQT4g5ewGjtFF6Btc7ofbGAbyfcdRkJw4',
    'QmYzeUZASCJVaD16dZxTr9Kf7oinGtaebqNghEaRouqaNt'
  )
}

export async function down(pgm: MigrationBuilder): Promise<void> {}

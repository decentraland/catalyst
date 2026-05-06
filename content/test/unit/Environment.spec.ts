import ms from 'ms'
import { EnvironmentBuilder, EnvironmentConfig } from '../../src/Environment'

describe('EnvironmentBuilder PROFILE_DURATION config', () => {
  let originalProfileDuration: string | undefined

  beforeEach(() => {
    originalProfileDuration = process.env.PROFILE_DURATION
  })

  afterEach(() => {
    if (originalProfileDuration === undefined) {
      delete process.env.PROFILE_DURATION
    } else {
      process.env.PROFILE_DURATION = originalProfileDuration
    }
  })

  it('defaults to 1 year when PROFILE_DURATION is not set', async () => {
    delete process.env.PROFILE_DURATION

    const env = await new EnvironmentBuilder().build()

    expect(env.getConfig(EnvironmentConfig.PROFILE_DURATION)).toBe(ms('1 year'))
  })

  it('parses a valid PROFILE_DURATION env var', async () => {
    process.env.PROFILE_DURATION = '7d'

    const env = await new EnvironmentBuilder().build()

    expect(env.getConfig(EnvironmentConfig.PROFILE_DURATION)).toBe(ms('7d'))
  })

  it('throws when PROFILE_DURATION env var is invalid', async () => {
    process.env.PROFILE_DURATION = 'not-a-real-duration'

    await expect(new EnvironmentBuilder().build()).rejects.toThrow(
      /Invalid PROFILE_DURATION value: "not-a-real-duration"/
    )
  })
})

import { Position3D, discretizedPositionDistance } from "decentraland-katalyst-utils/Positions"

describe("Discretize Positions", () => {
  it("should convert close positions to equivalent", () => {
    const position1: Position3D = [15, 15, 15];
    const position2: Position3D = [10, 10, 10];
    const origin: Position3D = [0, 0, 0]

    expect(discretizedPositionDistance(origin, position1)).toEqual(discretizedPositionDistance(origin, position2))    
  })

  it("should preserve higher distances when they are in different intervals", () => {
    const position1: Position3D = [20, 20, 20];
    const position2: Position3D = [90, 90, 90];
    const origin: Position3D = [0, 0, 0]

    expect(discretizedPositionDistance(origin, position1)).toBeLessThan(discretizedPositionDistance(origin, position2))    
  })

  it("should preserve make distances higher than the last interval equivalent", () => {
    const position1: Position3D = [990, 990, 990];
    const position2: Position3D = [44400, 44004, 44444];
    const origin: Position3D = [0, 0, 0]

    expect(discretizedPositionDistance(origin, position1)).toEqual(discretizedPositionDistance(origin, position2))    
  })

  it("should calculate according to the intervals", () => {
    const origin: Position3D = [0, 0, 0]

    expect(discretizedPositionDistance(origin, [20, 0, 0])).toEqual(0)
    expect(discretizedPositionDistance(origin, [0, 32, 0])).toEqual(0)
    expect(discretizedPositionDistance(origin, [0, 0, 48])).toEqual(1)
    expect(discretizedPositionDistance(origin, [30, 30, 30])).toEqual(1)
    expect(discretizedPositionDistance(origin, [72, 0, 0])).toEqual(2)
    expect(discretizedPositionDistance(origin, [60, 60, 60])).toEqual(3)
    expect(discretizedPositionDistance(origin, [150, 150, 150])).toEqual(3)        
  })
})
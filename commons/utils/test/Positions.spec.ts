import { Position3D, discretizedPositionDistance } from "decentraland-katalyst-utils/Positions"

describe("Discretize Positions", () => {
  it("should convert close positions to equivalent", () => {
    const position1: Position3D = [20, 20, 20];
    const position2: Position3D = [25, 25, 25];
    const origin: Position3D = [0, 0, 0]

    expect(discretizedPositionDistance(origin, position1)).toEqual(discretizedPositionDistance(origin, position2))    
  })

  it("should preserve higher distances when it is greater than the discretize interval", () => {
    const position1: Position3D = [20, 20, 20];
    const position2: Position3D = [90, 90, 90];
    const origin: Position3D = [0, 0, 0]

    expect(discretizedPositionDistance(origin, position1)).toBeLessThan(discretizedPositionDistance(origin, position2))    
  })

  it("should calculate according to the interval squared", () => {
    const origin: Position3D = [0, 0, 0]

    expect(discretizedPositionDistance(origin, [50, 0, 0], 50)).toEqual(1)
    expect(discretizedPositionDistance(origin, [0, 100, 0], 50)).toEqual(4)
    expect(discretizedPositionDistance(origin, [0, 0, 150], 50)).toEqual(9)
    expect(discretizedPositionDistance(origin, [100, 100, 100], 50)).toEqual(12)        
  })
})
export default class MockedDataBase {
  public one = (query: string, args: any, mapping: (row: any) => any): Promise<any> => {
    return Promise.resolve(null)
  }

  public map = (query: string, args: any, mapping: (row: any) => any): Promise<any[]> => {
    return Promise.resolve([])
  }

  public none(query: string, args: any, mapping?: (row: any) => any): Promise<any> {
    return Promise.resolve()
  }

  public batch(...args: any[]): Promise<any[]> {
    return Promise.resolve(args)
  }
}

import { Realm } from '../../../src/peerjs-server/models/realm'
import { createClient } from '../utils'

describe('Realm', () => {
  describe('#generateClientId', () => {
    it('should generate a 36-character UUID', () => {
      const realm = new Realm()
      expect(realm.generateClientId().length).toEqual(36)
    })
  })

  describe('#setClient', () => {
    it('should add client to realm', () => {
      const realm = new Realm()
      const client = createClient()

      realm.setClient(client, 'id')
      expect(realm.getClientsIds()).toEqual(['id'])
    })
  })

  describe('#removeClientById', () => {
    it('should remove client from realm', () => {
      const realm = new Realm()
      const client = createClient()

      realm.setClient(client, 'id')
      realm.removeClientById('id')

      expect(realm.getClientById('id')).toBeUndefined()
    })
  })

  describe('#getClientsIds', () => {
    it('should reflects on add/remove childs', () => {
      const realm = new Realm()
      const client = createClient()

      realm.setClient(client, 'id')
      expect(realm.getClientsIds()).toEqual(['id'])

      expect(realm.getClientById('id')).toEqual(client)

      realm.removeClientById('id')
      expect(realm.getClientsIds()).toEqual([])
    })
  })
})

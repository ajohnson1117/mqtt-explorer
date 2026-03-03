import { Dispatch } from 'redux'
import * as path from 'path'
import { Subscription } from 'mqtt-explorer-backend/src/DataSource/MqttSource'
import { makeOpenDialogRpc, makeSaveDialogRpc } from '../../../events/OpenDialogRequest'
import { AppState } from '../reducers'
import { clearLegacyConnectionOptions, loadLegacyConnectionOptions } from '../model/LegacyConnectionSettings'
import {
  ConnectionOptions,
  createEmptyConnection,
  makeDefaultConnections,
  CertificateParameters,
} from '../model/ConnectionOptions'
import { default as persistentStorage, StorageIdentifier } from '../utils/PersistentStorage'
import { showError } from './Global'
import { ActionTypes, Action } from '../reducers/ConnectionManager'
import { connectionsMigrator } from './migrations/Connection'
import { rendererRpc, readFromFile, writeToFile } from '../eventBus'

export interface ConnectionDictionary {
  [s: string]: ConnectionOptions
}
const storedConnectionsIdentifier: StorageIdentifier<ConnectionDictionary> = {
  id: 'ConnectionManager_connections',
}

export const loadConnectionSettings = () => async (dispatch: Dispatch<any>, getState: () => AppState) => {
  let connections
  try {
    await ensureConnectionsHaveBeenInitialized()
    connections = await persistentStorage.load(storedConnectionsIdentifier)

    // Apply migrations
    if (connections && connectionsMigrator.isMigrationNecessary(connections)) {
      connections = connectionsMigrator.applyMigrations(connections)
      await persistentStorage.store(storedConnectionsIdentifier, connections)
    }
  } catch (error) {
    dispatch(showError(error))
  }

  if (!connections) {
    return
  }

  dispatch(setConnections(connections))
  const firstKey = Object.keys(connections)[0]
  if (firstKey) {
    dispatch(selectConnection(firstKey))
  } else {
    // No connections exist - create a default one
    dispatch(createConnection())
  }
}

export type CertificateTypes = 'selfSignedCertificate' | 'clientCertificate' | 'clientKey'
export const selectCertificate =
  (type: CertificateTypes, connectionId: string) => async (dispatch: Dispatch<any>, getState: () => AppState) => {
    try {
      const certificate = await openCertificate()
      dispatch(
        updateConnection(connectionId, {
          [type]: certificate,
        })
      )
    } catch (error) {
      dispatch(showError(error))
    }
  }

async function openCertificate(): Promise<CertificateParameters> {
  const rejectReasons = {
    noCertificateSelected: 'No certificate selected',
    certificateSizeDoesNotMatch: 'Certificate size larger/smaller then expected.',
  }

  const openDialogReturnValue = await rendererRpc.call(makeOpenDialogRpc(), {
    properties: ['openFile'],
    securityScopedBookmarks: true,
  })

  const selectedFile = openDialogReturnValue.filePaths && openDialogReturnValue.filePaths[0]
  if (!selectedFile) {
    throw rejectReasons.noCertificateSelected
  }

  const data = await rendererRpc.call(readFromFile, { filePath: selectedFile })
  if (data.length > 16_384 || data.length < 64) {
    throw rejectReasons.certificateSizeDoesNotMatch
  }

  return {
    data: data.toString('base64'),
    name: path.basename(selectedFile),
  }
}

export const saveConnectionSettings = () => async (dispatch: Dispatch<any>, getState: () => AppState) => {
  try {
    console.log('store settings')
    await persistentStorage.store(storedConnectionsIdentifier, getState().connectionManager.connections)
  } catch (error) {
    dispatch(showError(error))
  }
}

export const updateConnection = (connectionId: string, changeSet: Partial<ConnectionOptions>): Action => ({
  connectionId,
  changeSet,
  type: ActionTypes.CONNECTION_MANAGER_UPDATE_CONNECTION,
})

export const addSubscription = (subscription: Subscription, connectionId: string): Action => ({
  connectionId,
  subscription,
  type: ActionTypes.CONNECTION_MANAGER_ADD_SUBSCRIPTION,
})

export const deleteSubscription = (subscription: Subscription, connectionId: string): Action => ({
  connectionId,
  subscription,
  type: ActionTypes.CONNECTION_MANAGER_DELETE_SUBSCRIPTION,
})

export const createConnection = () => (dispatch: Dispatch<any>) => {
  const newConnection = createEmptyConnection()
  dispatch(addConnection(newConnection))
  dispatch(selectConnection(newConnection.id))
}

export const setConnections = (connections: { [s: string]: ConnectionOptions }): Action => ({
  connections,
  type: ActionTypes.CONNECTION_MANAGER_SET_CONNECTIONS,
})

export const selectConnection = (connectionId: string): Action => ({
  selected: connectionId,
  type: ActionTypes.CONNECTION_MANAGER_SELECT_CONNECTION,
})

export const addConnection = (connection: ConnectionOptions): Action => ({
  connection,
  type: ActionTypes.CONNECTION_MANAGER_ADD_CONNECTION,
})

export const toggleAdvancedSettings = (): Action => ({
  type: ActionTypes.CONNECTION_MANAGER_TOGGLE_ADVANCED_SETTINGS,
})

export const toggleCertificateSettings = (): Action => ({
  type: ActionTypes.CONNECTION_MANAGER_TOGGLE_CERTIFICATE_SETTINGS,
})

export const deleteConnection = (connectionId: string) => (dispatch: Dispatch<any>, getState: () => AppState) => {
  const connectionIds = Object.keys(getState().connectionManager.connections)
  const connectionIdLocation = connectionIds.indexOf(connectionId)

  const remainingIds = connectionIds.filter(id => id !== connectionId)
  const nextSelectedConnectionIndex = Math.min(remainingIds.length - 1, connectionIdLocation)
  const nextSelectedConnection = remainingIds[nextSelectedConnectionIndex]

  dispatch({
    connectionId,
    type: ActionTypes.CONNECTION_MANAGER_DELETE_CONNECTION,
  })

  if (nextSelectedConnection) {
    dispatch(selectConnection(nextSelectedConnection))
  }
}

async function ensureConnectionsHaveBeenInitialized() {
  let connections = await persistentStorage.load(storedConnectionsIdentifier)
  const requiresInitialization = !connections
  if (requiresInitialization) {
    const migratedConnection = loadLegacyConnectionOptions()
    const defaultConnections = makeDefaultConnections()
    connections = {
      ...migratedConnection,
      ...defaultConnections,
    }
    await persistentStorage.store(storedConnectionsIdentifier, connections)

    clearLegacyConnectionOptions()
  }
}

export const toggleFavorite = (connectionId: string) => (dispatch: Dispatch<any>, getState: () => AppState) => {
  const connection = getState().connectionManager.connections[connectionId]
  if (!connection) {
    return
  }
  dispatch(updateConnection(connectionId, { favorite: !connection.favorite }))
  dispatch(saveConnectionSettings() as any)
}

export const exportConnections = () => async (dispatch: Dispatch<any>, getState: () => AppState) => {
  try {
    const saveDialogReturnValue = await rendererRpc.call(makeSaveDialogRpc(), {
      defaultPath: 'mqtt-explorer-connections.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })

    const filePath = saveDialogReturnValue.filePath
    if (!filePath) {
      return
    }

    const connections = getState().connectionManager.connections
    const data = JSON.stringify(connections, null, 2)
    await rendererRpc.call(writeToFile, { filePath, data })
  } catch (error) {
    dispatch(showError(error))
  }
}

export const importConnections = () => async (dispatch: Dispatch<any>, getState: () => AppState) => {
  try {
    const openDialogReturnValue = await rendererRpc.call(makeOpenDialogRpc(), {
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })

    const selectedFile = openDialogReturnValue.filePaths && openDialogReturnValue.filePaths[0]
    if (!selectedFile) {
      return
    }

    const data = await rendererRpc.call(readFromFile, { filePath: selectedFile })
    const parsed = JSON.parse(data.toString())

    // Validate: must be an object where every value has configVersion: 1
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid connections file format')
    }
    for (const key of Object.keys(parsed)) {
      if (parsed[key].configVersion !== 1) {
        throw new Error(`Invalid connection entry: ${key}`)
      }
    }

    const existing = getState().connectionManager.connections
    const merged = { ...existing, ...parsed }
    dispatch(setConnections(merged))
    dispatch(saveConnectionSettings() as any)
  } catch (error) {
    dispatch(showError(error))
  }
}

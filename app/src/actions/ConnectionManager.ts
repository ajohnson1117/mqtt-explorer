import { Dispatch } from 'redux'
import * as path from 'path'
import { v4 } from 'uuid'
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
import { showError, showNotification } from './Global'
import { ActionTypes, Action } from '../reducers/ConnectionManager'
import { connectionsMigrator } from './migrations/Connection'
import { rendererRpc, readFromFile, writeToFile } from '../eventBus'
import { isBrowserMode } from '../utils/browserMode'

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

export const exportConnections = () => async (dispatch: Dispatch<any>, getState: () => AppState) => {
  try {
    const connections = getState().connectionManager.connections
    const exportData = JSON.stringify(connections, null, 2)

    if (isBrowserMode) {
      const blob = new Blob([exportData], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'mqtt-explorer-connections.json'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      return
    }

    const { canceled, filePath } = await rendererRpc.call(makeSaveDialogRpc(), {
      title: 'Export Connections',
      defaultPath: 'mqtt-explorer-connections.json',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
    })

    if (!canceled && filePath) {
      const base64Data = btoa(unescape(encodeURIComponent(exportData)))
      await rendererRpc.call(writeToFile, { filePath, data: base64Data })
      dispatch(showNotification(`Connections exported to ${filePath}`))
    }
  } catch (error) {
    dispatch(showError(error))
  }
}

export const importConnections = () => async (dispatch: Dispatch<any>, getState: () => AppState) => {
  try {
    let jsonString: string

    if (isBrowserMode) {
      jsonString = await new Promise<string>((resolve, reject) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json'
        input.onchange = (event: any) => {
          const file = event.target.files?.[0]
          if (!file) {
            reject('No file selected')
            return
          }
          const reader = new FileReader()
          reader.onload = (e) => resolve(e.target?.result as string)
          reader.onerror = () => reject('Error reading file')
          reader.readAsText(file)
        }
        input.click()
      })
    } else {
      const openDialogReturnValue = await rendererRpc.call(makeOpenDialogRpc(), {
        title: 'Import Connections',
        properties: ['openFile'],
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
      })

      const selectedFile = openDialogReturnValue.filePaths && openDialogReturnValue.filePaths[0]
      if (!selectedFile) {
        return
      }

      const data = await rendererRpc.call(readFromFile, { filePath: selectedFile, encoding: 'utf8' })
      jsonString = typeof data === 'string' ? data : data.toString()
    }

    const importedConnections = JSON.parse(jsonString)

    if (typeof importedConnections !== 'object' || importedConnections === null || Array.isArray(importedConnections)) {
      throw 'Invalid file format: expected a connections dictionary'
    }

    let importCount = 0
    Object.values(importedConnections).forEach((connection: any) => {
      if (!connection.name && !connection.host) {
        return
      }
      const newId = v4() as string
      const newConnection: ConnectionOptions = {
        ...createEmptyConnection(),
        ...connection,
        id: newId,
      }
      dispatch(addConnection(newConnection))
      importCount++
    })

    if (importCount > 0) {
      dispatch(saveConnectionSettings() as any)
      dispatch(showNotification(`Imported ${importCount} connection${importCount !== 1 ? 's' : ''}`))
    } else {
      dispatch(showNotification('No valid connections found in file'))
    }
  } catch (error) {
    if (typeof error === 'string') {
      dispatch(showError(error))
    } else {
      dispatch(showError('Failed to import connections. Please check the file format.'))
    }
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

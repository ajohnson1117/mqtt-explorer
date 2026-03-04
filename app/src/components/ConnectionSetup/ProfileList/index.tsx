import React, { useState, useMemo } from 'react'
import { bindActionCreators } from 'redux'
import { connect } from 'react-redux'
import { IconButton, InputAdornment, List, TextField, Tooltip } from '@mui/material'
import { Theme } from '@mui/material/styles'
import { withStyles } from '@mui/styles'
import FileUpload from '@mui/icons-material/FileUpload'
import FileDownload from '@mui/icons-material/FileDownload'
import Search from '@mui/icons-material/Search'
import Clear from '@mui/icons-material/Clear'
import ConnectionItem from './ConnectionItem'
import { AddButton } from './AddButton'
import { AppState } from '../../../reducers'
import { connectionManagerActions } from '../../../actions'
import { ConnectionOptions } from '../../../model/ConnectionOptions'
import { KeyCodes } from '../../../utils/KeyCodes'
import { useGlobalKeyEventHandler } from '../../../effects/useGlobalKeyEventHandler'

const ConnectionItemAny = ConnectionItem as any

interface Props {
  classes: any
  selected?: string
  connections: { [s: string]: ConnectionOptions }
  actions: typeof connectionManagerActions
}

function ProfileList(props: Props) {
  const { actions, classes, connections, selected } = props
  const [searchQuery, setSearchQuery] = useState('')

  const sortedConnections = useMemo(() => {
    const allConnections = Object.values(connections).sort((a, b) => {
      const aFav = a.favorite ? 1 : 0
      const bFav = b.favorite ? 1 : 0
      if (aFav !== bFav) return bFav - aFav
      return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    })

    if (!searchQuery.trim()) return allConnections

    const query = searchQuery.toLowerCase()
    return allConnections.filter(
      c =>
        (c.name || '').toLowerCase().includes(query) ||
        (c.host || '').toLowerCase().includes(query)
    )
  }, [connections, searchQuery])

  const selectConnection = (dir: 'next' | 'previous') => (event: KeyboardEvent) => {
    if (!selected) {
      return
    }
    const indexDirection = dir === 'next' ? 1 : -1
    const selectedIndex = sortedConnections.map(connection => connection.id).indexOf(selected)
    const nextConnection = sortedConnections[selectedIndex + indexDirection]
    if (nextConnection) {
      actions.selectConnection(nextConnection.id)
    }
    event.preventDefault()
  }

  useGlobalKeyEventHandler(KeyCodes.arrow_down, selectConnection('next'))
  useGlobalKeyEventHandler(KeyCodes.arrow_up, selectConnection('previous'))

  const createConnectionButton = (
    <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center' }}>
      <AddButton action={actions.createConnection} />
      <span style={{ flex: 1 }}>Connections</span>
      <Tooltip title="Import connections">
        <IconButton size="small" onClick={actions.importConnections} aria-label="Import connections">
          <FileUpload fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Export connections">
        <IconButton size="small" onClick={actions.exportConnections} aria-label="Export connections">
          <FileDownload fontSize="small" />
        </IconButton>
      </Tooltip>
    </div>
  )

  return (
    <List style={{ height: '100%', display: 'flex', flexDirection: 'column' }} component="nav" subheader={createConnectionButton}>
      <div style={{ padding: '0 12px 4px' }}>
        <TextField
          size="small"
          placeholder="Search connections..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          fullWidth
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" color="action" />
              </InputAdornment>
            ),
            endAdornment: searchQuery ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearchQuery('')} aria-label="Clear search">
                  <Clear fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
          inputProps={{ 'aria-label': 'Search connections' }}
        />
      </div>
      <div className={classes.list}>
        {sortedConnections.map(connection => (
          <ConnectionItemAny connection={connection} key={connection.id} selected={selected === connection.id} />
        ))}
      </div>
    </List>
  )
}

const styles = (theme: Theme) => ({
  list: {
    flex: 1,
    overflowY: 'auto' as const,
  },
})

const mapDispatchToProps = (dispatch: any) => ({
  actions: bindActionCreators(connectionManagerActions, dispatch),
})

const mapStateToProps = (state: AppState) => ({
  connections: state.connectionManager.connections,
  selected: state.connectionManager.selected,
})

export default connect(mapStateToProps, mapDispatchToProps)(withStyles(styles)(ProfileList) as any)

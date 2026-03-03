import React, { useCallback } from 'react'
import { connect } from 'react-redux'
import { ListItem, Typography, IconButton } from '@mui/material'
import Favorite from '@mui/icons-material/Favorite'
import FavoriteBorder from '@mui/icons-material/FavoriteBorder'
import { withStyles } from '@mui/styles'
import { Theme } from '@mui/material/styles'
import { bindActionCreators } from 'redux'
import { toMqttConnection, ConnectionOptions } from '../../../model/ConnectionOptions'
import { connectionActions, connectionManagerActions } from '../../../actions'

export interface Props {
  connection: ConnectionOptions
  actions: {
    connection: any
    connectionManager: any
  }
  selected: boolean
  classes: any
}

function ConnectionItem(props: Props) {
  const connect = useCallback(() => {
    const mqttOptions = toMqttConnection(props.connection)
    if (mqttOptions) {
      props.actions.connection.connect(mqttOptions, props.connection.id)
    }
  }, [props.connection, props])

  const handleFavoriteClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      props.actions.connectionManager.toggleFavorite(props.connection.id)
    },
    [props.connection.id, props.actions.connectionManager]
  )

  const connection = props.connection.host && toMqttConnection(props.connection)
  return (
    <ListItem
      button
      selected={props.selected}
      style={{ display: 'flex', alignItems: 'center' }}
      onClick={() => props.actions.connectionManager.selectConnection(props.connection.id)}
      onDoubleClick={() => {
        props.actions.connectionManager.selectConnection(props.connection.id)
        connect()
      }}
    >
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Typography className={props.classes.name}>{props.connection.name || 'mqtt broker'}</Typography>
        <Typography className={props.classes.details}>{connection && connection.url}</Typography>
      </div>
      <IconButton
        size="small"
        onClick={handleFavoriteClick}
        style={{ color: props.connection.favorite ? '#e91e63' : undefined, flexShrink: 0 }}
        aria-label={props.connection.favorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        {props.connection.favorite ? (
          <Favorite style={{ fontSize: '0.9rem' }} />
        ) : (
          <FavoriteBorder style={{ fontSize: '0.9rem' }} />
        )}
      </IconButton>
    </ListItem>
  )
}

export const mapDispatchToProps = (dispatch: any) => ({
  actions: {
    connection: bindActionCreators(connectionActions, dispatch),
    connectionManager: bindActionCreators(connectionManagerActions, dispatch),
  },
})
export const connectionItemStyle = (theme: Theme) => ({
  name: {
    width: '100%',
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
  },
  details: {
    width: '100%',
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    color: theme.palette.text.secondary,
    fontSize: '0.7em',
  },
})

export default connect(null, mapDispatchToProps)(withStyles(connectionItemStyle)(ConnectionItem) as any)

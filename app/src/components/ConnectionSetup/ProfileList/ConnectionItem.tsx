import React, { useCallback } from 'react'
import { connect } from 'react-redux'
import { IconButton, ListItem, Typography } from '@mui/material'
import { withStyles } from '@mui/styles'
import { Theme } from '@mui/material/styles'
import Star from '@mui/icons-material/Star'
import StarBorder from '@mui/icons-material/StarBorder'
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

  const toggleFavorite = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      props.actions.connectionManager.updateConnection(props.connection.id, {
        favorite: !props.connection.favorite,
      })
    },
    [props.connection.id, props.connection.favorite, props.actions.connectionManager]
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
        onClick={toggleFavorite}
        aria-label={props.connection.favorite ? 'Remove from favorites' : 'Add to favorites'}
        style={{ padding: 4 }}
      >
        {props.connection.favorite ? (
          <Star fontSize="small" style={{ color: '#FFD700' }} />
        ) : (
          <StarBorder fontSize="small" />
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

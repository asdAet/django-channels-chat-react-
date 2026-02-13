import { useContext } from 'react'

import { DirectInboxContext } from './context'

export const useDirectInbox = () => useContext(DirectInboxContext)

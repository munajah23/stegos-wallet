import { send } from 'redux-electron-ipc';
import { push } from 'connected-react-router';
import type { Dispatch, GetState, NetType } from '../reducers/types';
import { connect, send as wsSend } from '../ws/actions';
import { sendSync, subscribe, unsubscribe } from '../ws/client';
import routes from '../constants/routes';
import { wsEndpoint } from '../constants/config';
import { createHistoryInfoAction } from './accounts';
import { SET_WAITING } from './settings';

const WS_ENDPOINT = `ws://${process.env.APIENDPOINT || wsEndpoint}`;

export const CHECK_RUNNING_NODE = 'CHECK_RUNNING_NODE';
export const CHECK_RUNNING_NODE_RESULT = 'CHECK_RUNNING_NODE_RESULT';
export const SET_CHAIN = 'SET_CHAIN';
export const RUN_NODE = 'RUN_NODE';
export const CONNECT_TO_NODE = 'CONNECT_TO_NODE';
export const RUN_NODE_FAILED = 'RUN_NODE_FAILED';
export const TOKEN_RECEIVED = 'TOKEN_RECEIVED';

export const checkRunningNode = () => (dispatch: Dispatch) => {
  dispatch(send(CHECK_RUNNING_NODE));
};

export const onResultOfCheckingRunningNode = (_, args) => (
  dispatch: Dispatch,
  getState: GetState
) => {
  dispatch({ type: CHECK_RUNNING_NODE_RESULT, payload: { ...args } });
  const state = getState();
  if (state.app.isFirstLaunch === false && args.isRunning === true)
    dispatch(push(routes.SYNC));
};

export const setChain = (type: NetType) => (dispatch: Dispatch) => {
  dispatch({ type: SET_CHAIN, payload: type });
};

export const runNode = () => (dispatch: Dispatch, getState: GetState) => {
  const state = getState();
  dispatch(send(RUN_NODE, { chain: state.node.chain }));
};

export const connectToNode = () => (dispatch: Dispatch) => {
  dispatch(send(CONNECT_TO_NODE));
};

export const onRunNodeFailed = (_, args) => (dispatch: Dispatch) => {
  dispatch({ type: RUN_NODE_FAILED, payload: args });
};

export const onTokenReceived = (event, token) => (dispatch: Dispatch) => {
  dispatch({ type: TOKEN_RECEIVED, payload: { token } });
  subscribe(handleNodeSynchronization);
  dispatch(
    connect(
      WS_ENDPOINT,
      token
    )
  );
};

const onSynced = () => (dispatch: Dispatch, getState: GetState) => {
  const state = getState();
  const { app } = state;
  subscribe(handleTransactions);
  dispatch(
    push(app.isFirstLaunch ? routes.BAGS_AND_TERMS : routes.ENTER_PASSWORD)
  );
};

export const validateCertificate = (
  spender: string,
  recipient: string,
  rvalue: string,
  utxo: string
) => (dispatch: Dispatch) => {
  dispatch({ type: SET_WAITING, payload: { waiting: true } });
  return sendSync({
    type: 'validate_certificate',
    spender,
    recipient,
    rvalue,
    utxo
  }).finally(() => {
    dispatch({ type: SET_WAITING, payload: { waiting: false } });
  });
};

const handleNodeSynchronization = (dispatch: Dispatch, data: string) => {
  if (
    (data.type === 'status_changed' || data.type === 'subscribed_status') &&
    data.is_synchronized
  ) {
    unsubscribe(handleNodeSynchronization);
    dispatch(onSynced());
  }
};

const handleTransactions = (dispatch: Dispatch, data: string) => {
  if (data.type === 'received' || data.type === 'spent') {
    dispatch(wsSend(createHistoryInfoAction(data.account_id)));
  }
  if (data.type === 'snowball_status') {
    let state;
    switch (data.state) {
      // todo
      case 'pool_wait':
        state = 'Snowball protocol state: pool_wait (1/6)';
        break;
      case 'shared_keying':
        state = 'Snowball protocol state: shared_keying (2/6)';
        break;
      case 'commitment':
        state = 'Snowball protocol state: commitment (3/6)';
        break;
      case 'cloaked_vals':
        state = 'Snowball protocol state: cloaked_vals (4/6)';
        break;
      case 'signature':
        state = 'Snowball protocol state: signature (5/6)';
        break;
      case 'succeeded':
        state = 'Snowball protocol state: succeeded (6/6)';
        break;
      default:
    }
    dispatch({ type: SET_WAITING, payload: { waiting: true, status: state } });
  }
};

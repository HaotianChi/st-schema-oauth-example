'use strict';

const db = require('./db');
const mapping = require('./mapping');
const SSE = require('express-sse');
const {StateUpdateRequest} = require("st-schema");

module.exports = {

  /**
   * Queries for installations of connectors for the specified username and sends state updates to each of them
   *
   * @param username Username of account to send updates to
   * @param externalDeviceId Third-party ID of the device being updated
   * @param externalStates States being updated
   * @param skipThisToken Options access token to skip. Specifed when udates are from a command in that account, to
   * avoid race conditions updating the same account
   */
  async updateProactiveState(username, externalDeviceId, externalStates, skipThisToken) {
    const externalDevice = await db.getDevice(username, externalDeviceId)

    const stateUpdateRequest = new StateUpdateRequest(
      process.env.ST_CLIENT_ID,
      process.env.ST_CLIENT_SECRET
    );

    const deviceState = [
      {
        externalDeviceId: externalDeviceId,
        states: mapping.stStatesFor(externalStates, externalDevice.states)
      }
    ];

    this.sse.send(deviceState);

    db.getCallbacks(username).then(callbacks => {
      for (const it of callbacks) {
        if (it.access_token !== skipThisToken && it.callbackAuth && it.callbackUrls) {
          stateUpdateRequest.updateState(it.callbackUrls, it.callbackAuth, deviceState, refreshedAuth => {
            db.refreshCallbackToken(it.access_token, refreshedAuth);
          }).then(res => {
            //stateUpdateRequest.updateState(it.callbackUrls, it.callbackAuth, deviceState).then(res => {
            console.log('State updated')
          }).catch(err => {
            console.log(`Error updating state: "${err}"`)
          });
        }
      }
    })
  },

  sse:  new SSE()
};

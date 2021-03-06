'use strict';

const db = require('./db');
const deviceService = require('./device-service');
const mapping = require('./mapping');
const {SchemaConnector} = require('st-schema');

/**
 * ST Schema Connector
 */
const connector = new SchemaConnector()
  .clientId(process.env.ST_CLIENT_ID)
  .clientSecret(process.env.ST_CLIENT_SECRET)
  .enableEventLogging(2)

  .discoveryHandler(async (accessToken, response) => {
    for (const device of (await db.getDevicesForToken(accessToken))) {
      const d = response.addDevice(device.externalId, device.displayName, device.handlerType)
      d.manufacturerName('STS');
      d.modelName(device.handlerType);
    }
  })

  .stateRefreshHandler(async (accessToken, response) => {
    for (const device of (await db.getDevicesForToken(accessToken))) {
      response.addDevice(device.externalId, mapping.stStatesFor(device.states))
    }
  })

  .commandHandler(async (accessToken, response, devices) => {
    const account = await db.getAccountForToken(accessToken);
    const ops = devices.map(async ({ externalDeviceId, deviceCookie, commands }) => {

      const externalDevice = await db.getDevice(account.username, externalDeviceId)
      const externalStates = mapping.externalStatesFor(commands);
      const stStates = mapping.stStatesFor(externalStates, externalDevice.states);
      response.addDevice(externalDeviceId, stStates, deviceCookie);

      deviceService.updateProactiveState(account.username, externalDeviceId, externalStates, accessToken);
      return db.updateDeviceState(account.username, externalDeviceId, externalStates)
    });

    await Promise.all(ops);
  })

  .callbackAccessHandler(async (accessToken, callbackAuthentication, callbackUrls) => {
    db.setCallbackInfo(accessToken, callbackAuthentication, callbackUrls)
  })

  .integrationDeletedHandler(accessToken => {
    db.removeToken(accessToken)
  });

module.exports = connector;

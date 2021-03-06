/*
  This program and the accompanying materials are
  made available under the terms of the Eclipse Public License v2.0 which accompanies
  this distribution, and is available at https://www.eclipse.org/legal/epl-v20.html
  
  SPDX-License-Identifier: EPL-2.0
  
  Copyright Contributors to the Zowe Project.
*/

function ZssAuthenticator(pluginDef, pluginConf, serverConf) {
  this.authPluginID = pluginDef.identifier;
}

ZssAuthenticator.prototype = {

  getStatus(sessionState) {
    return {  
      authenticated: !!sessionState.authenticated, 
      username: sessionState.zssUsername
    };
  },
  
  /**
   * Should be called e.g. when the users enters credentials
   * 
   * Supposed to change the state of the client-server session. NOP for 
   * stateless authentication (e.g. HTTP basic). 
   * 
   * `request` must be treated as read-only by the code. `sessionState` is this
   * plugin's private storage within the session (if stateful)
   * 
   * If auth doesn't fail, should return an object containing at least 
   * { success: true }. Should not reject the promise.
   */ 
  authenticate(request, sessionState) {
    return new Promise((resolve, reject) => {
    request.zluxData.webApp.callRootService("login", { 
      method: "POST",
      body: request.body
    }).then((response) => {
        let zssCookie;
        if (typeof response.headers['set-cookie'] === 'object') {
          for (const cookie of response.headers['set-cookie']) {
            const content = cookie.split(';')[0];
            //TODO proper manage cookie expiration
            if (content.indexOf('jedHTTPSession') >= 0) {
              zssCookie = content;
            }
          }
        }
        if (zssCookie) {
          sessionState.zssUsername = request.body.username;
          sessionState.authenticated = true;
          sessionState.zssCookies = zssCookie;
          resolve({ success: true })
        } else {
          sessionState.authenticated = false;
          delete sessionState.zssUsername;
          delete sessionState.zssCookies;
          if (response.statusCode === 500) {
            resolve({ success: false, reason: 'ConnectionError'});
          } else {
            resolve({ success: false});
          }
        }
      }).catch((e) =>  { 
        console.log(e);
        sessionState.authenticated = false;
        delete sessionState.zssUsername;
        delete sessionState.zssCookies;
        resolve({ success: false }) 
      });
    });
  },

  /**
   * Invoked for every service call by the middleware.
   * 
   * Checks if the session is valid in a stateful scheme, or authenticates the
   * request in a stateless scheme. Then checks if the user can access the
   * resource.  Modifies the request if necessary.
   * 
   * `sessionState` is this plugin's private storage within the session (if 
   * stateful)
   * 
   * The promise should resolve to an object containing, at least, 
   * { authorized: true } if everything is fine. Should not reject the promise.
   */
  authorized(request, sessionState) {
    if (sessionState.authenticated) {
      request.username = sessionState.zssUsername;
      return Promise.resolve({  authenticated: true, authorized: true });
    } else {
      return Promise.resolve({  authenticated: false, authorized: false });
    }
  }, 
  
  addProxyAuthorizations(req1, req2Options, sessionState) {
    if (!sessionState.zssCookies) {
      return;
    }
    req2Options.headers['cookie'] = sessionState.zssCookies;
  }
};

module.exports = function(pluginDef, pluginConf, serverConf) {
  return Promise.resolve(new ZssAuthenticator(pluginDef, pluginConf, 
      serverConf));
}


/*
  This program and the accompanying materials are
  made available under the terms of the Eclipse Public License v2.0 which accompanies
  this distribution, and is available at https://www.eclipse.org/legal/epl-v20.html
  
  SPDX-License-Identifier: EPL-2.0
  
  Copyright Contributors to the Zowe Project.
*/

/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

declare module 'gateway-addon' {
    class Adapter {
        constructor(addonManager: any, id: string, packageName: string);
    }

    class Database {
        constructor(packageName:string, path?:string);
    }
}

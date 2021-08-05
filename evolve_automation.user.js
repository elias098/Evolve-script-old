// ==UserScript==
// @name         Evolve test
// @namespace    http://tampermonkey.net/
// @version      3.3.1.75
// @description  try to take over the world!
// @downloadURL  https://gist.github.com/elias098/cc891c9c4bdc6276a8dfa4d346d92c30/raw/evolve_automation.user.js
// @author       Fafnir
// @author       TMVictor
// @author       Vollch
// @match        https://pmotschmann.github.io/Evolve/
// @grant        none
// @require      https://code.jquery.com/jquery-3.4.1.min.js
// @require      https://code.jquery.com/ui/1.12.1/jquery-ui.min.js
// ==/UserScript==
//
// This script forked from TMVictor's script version 3.3.1. Original script: https://gist.github.com/TMVictor/3f24e27a21215414ddc68842057482da
//
// Most of script options have tooltips, explaining what they do, read them if you have a questions.
//
// Here's some tips about non-intuitive features:
//   autoMarket, autoGalaxyMarket, autoFactory, and autoMiningDroid use weightings and priorities to determine their tasks. Resources split by groups of same priority, and then resources within group having the best priority distributed according to their weights. If there's still some more unused routes\factories\drones after assigning, script moves to next group with lower priority, etc. In most cases only one group with highest priority is active and working, while other groups serve as fallback for cases when all resources with better priority are either capped, or, in case of factory, unaffordable. There's few special values for finer configuration:
//     Prioritization(queue, trigger, etc) does temporarily change priority of resource to 100, thus resources with priority above 100 won't be affected by prioritization.
//       You can also disable prioritization under General Settings, if you can't cope with it.
//     Priority of -1 it's special supplementary value meaning "same as current highest". Resources with this value will always be crafted among with whatever currently have highest priority, without disabling them.
//     Resources with 0 priority won't be crafted during normal workflow, unless prioritized(which increases priority).
//     Resources with 0 weighting won't ever be crafted, regardless of configured priority or prioritization.
//     autoMarket and autoFactory also have separate global checkboxes per resources, when they disabled(both buying and selling in case of autoMarket) - script won't touch them, leaving with whatever was manually set.
//   Added numbers in Mech Labs represents: design efficiency, real mech power affected by mech size, and power per used space, respectively. For all three - bigger numbers are better. Collectors show their supply collect rate.
//   Buildings\researches queue, triggers, and available researches prioritize missing resources, overiding other script settings. If you have issues with factories producing not what you want, market buying not what you want, and such - you can disable this feature under general settings.
//     Alternatively you may try to tweak options of producing facilities: resources with 0 weighting won't ever be produced, even when script tries to prioritize it. And resources with priority -1 will always have highest available priority, even when facility prioritizing something else. But not all facilities can be configured in that way.
//   Auto Storage assigns crates\containers to make enough storage to build all buildings with enabled Auto Build.
//     If some storage grew too high, taking all crates, you can disable expensive building, and Auto Storage won't try to fullfil its demands anymore. If you want to expand storage to build something manually, you can limit maximum level of building to 0, thus while it technically have auto build enabled, it won't ever be autobuilded, but you'll have needed storage.
//   Order in which buildings receive power depends on order in buildings settings, you can drag and drop them to adjust priorities.
//     Filtering works with names, some settings, and resource cost. E.g. you can filter for "build==on", "power==off", "weight<100", "soul gem>0", "iron>=1G" and such.
//     By default Ascension Trigger placed where it can be activated as soon as possible without killing soldiers or population, and reducing prestige rewards. But it still can hurt production badly. If you're planning to ascend at very first opportunity(i.e. not planning to go for pillar or such), you may enable auto powering it. Otherwise you may want to delay with it till the moment when you'll be ready. (Or you can just move it where it will be less impacting on production, but that also means it'll take longer to get enough power)
//     Auto Power have two toggles, first one enables basic management for building: based on priority, available power, support, and fuel. Logic behind second toggle is individual per building, but generally it tries to behave smart and save resources when it's enabled.
//   Evolution Queue can change any script settings, not only those which you have after adding new task, you can append any variables and their values manually, if you're capable to read code, and can find internal names and acceptable values of those variables. Settings applied at the moment when new evolution starts. (Or right before reset in case of Cataclysm)
//     Unavailable tasks in evolution queue will be ignored, so you can queue something like salamander and balorg, one after another, and configure script to pick either volcano or hellscape after bioseed. And, assuming you'll get either of these planets, it'll go for one of those two races. (You can configure more options to pick from, if you want)
//   Auto Smelter does adjust rate of Inferno fuel and Oil for best cost and efficiency, but only when Inferno directly above oil.
//   All settings can be reset to default at once by importing {} as script settings.
//   Autoclicker can trivialize many aspects of the game, and ruin experience. Spoil your game at your own risk!







// Zoom out with nwjs
let win = nw.Window.get();
win.zoomLevel = -0.6;

// Write save and script settings to file on close
fs = require('fs');
win.on('close', function() {
    try {
        let ts = Date.now();

        let date_ob = new Date(ts);
        let date = date_ob.getDate();
        let month = date_ob.getMonth() + 1;
        let year = date_ob.getFullYear();
        let hour = date_ob.getHours();
        let minute = date_ob.getMinutes();
        let second = date_ob.getSeconds();

        let data = `${hour}:${minute}:${second}\n\nsave:\n${win.window.exportGame()}\n\nscript settings:\n${win.window.localStorage.getItem('settings') ?? ""}\n\n\n\n\n`
        fs.appendFileSync(`./save/save${date}-${month}-${year}.txt`, data);
    } catch (err) {
        alert(err)
    }
    win.close(true);
});





(function($) {
    'use strict';
    var settings = JSON.parse(localStorage.getItem('settings')) ?? {};
    var game = null;
    var win = null;

    var showLogging = false;
    var loggingType = "autoJobs";

    // Class definitions

    class Job {
        constructor(id, name) {
            // Private properties
            this._originalId = id;
            this._originalName = name;
            this._vueBinding = "civ-" + this._originalId;

            this.autoJobEnabled = true;
            this.priority = 0;

            this.breakpoints = [];
        }

        get definition() {
            return game.global.civic[this._originalId];
        }

        get id() {
            return this.definition.job;
        }

        get name() {
            return this.definition.name;
        }

        isUnlocked() {
            return this.definition.display;
        }

        isManaged() {
            if (!this.isUnlocked()) {
                return false;
            }

            return this.autoJobEnabled;
        }

        isUnlimited() {
            return unlimitedJobs.includes(this._originalId);
        }

        get count() {
            return this.definition.workers;
        }

        get max() {
            if (this.definition.max === -1) {
                return Number.MAX_SAFE_INTEGER;
            }

            return this.definition.max;
        }

        breakpointEmployees(breakpoint) {
            let breakpointActual = this.breakpoints[breakpoint];

            // -1 equals unlimited up to the maximum available jobs for this job
            if (breakpointActual === -1) {
                breakpointActual = Number.MAX_SAFE_INTEGER;
            }

            // return the actual workers required for this breakpoint (either our breakpoint or our max, whichever is lower)
            return Math.min(breakpointActual, this.max);
        }

        addWorkers(count) {
            if (!this.isUnlocked() || this.isDefault()) {
                return false;
            }
            if (count < 0) {
                this.removeWorkers(-1 * count);
            }

            let vue = getVueById(this._vueBinding);
            if (vue === undefined) { return false; }

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                vue.add();
            }
        }

        removeWorkers(count) {
            if (!this.isUnlocked() || this.isDefault()) {
                return false;
            }
            if (count < 0) {
                this.addWorkers(-1 * count);
            }

            let vue = getVueById(this._vueBinding);
            if (vue === undefined) { return false; }

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                vue.sub();
            }
        }

        isDefault() {
            return game.global.civic.d_job === this.id;
        }

        setAsDefault() {
            if (this.definition.max === -1) {
                getVueById(this._vueBinding)?.setDefault(this.id);
            }
        }
    }

    class CraftingJob extends Job {
        constructor(id, name, resource) {
            super(id, name);

            this._vueBinding = "foundry";
            this.resource = resource;
        }

        get definition() {
            return game.global.civic['craftsman'];
        }

        get id() {
            return this.resource.id;
        }

        isUnlocked() {
            return game.global.resource[this._originalId].display;
        }

        get count() {
            return game.global.city.foundry[this._originalId];
        }

        get max() {
            return game.global.civic.craftsman.max;
        }

        addWorkers(count) {
            if (!this.isUnlocked()) {
                return false;
            }
            if (count < 0) {
                this.removeWorkers(-1 * count);
            }

            let vue = getVueById(this._vueBinding);
            if (vue === undefined) { return false; }

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                vue.add(this._originalId);
            }
        }

        removeWorkers(count) {
            if (!this.isUnlocked()) {
                return false;
            }
            if (count < 0) {
                this.addWorkers(-1 * count);
            }

            let vue = getVueById(this._vueBinding);
            if (vue === undefined) { return false; }

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                vue.sub(this._originalId);
            }
        }
    }

    class Resource {
        constructor(name, id) {
            this.name = name;
            this._id = id;
            this.autoCraftEnabled = true;

            this.tradeBuyPrice = 0;
            this.tradeSellPrice = 0;
            this.tradeRoutes = 0;
            this.tradeIncome = 0;

            this.marketPriority = 0;
            this.autoBuyEnabled = false;
            this.autoSellEnabled = false;
            this.autoBuyRatio = 0;
            this.autoSellRatio = 1;
            this.autoTradeBuyEnabled = false;
            this.autoTradeSellEnabled = true;
            this.autoTradeWeighting = 1;
            this.autoTradePriority = 1;
            this.galaxyMarketWeighting = 1;
            this.galaxyMarketPriority = 1;

            this.ejectEnabled = false;
            this.supplyEnabled = false;

            this.storeOverflow = false;
            this.storagePriority = 0;
            this.storageRequired = 1;
            this.autoStorageEnabled = true;
            this._autoCratesMax = -1;
            this._autoContainersMax = -1;

            this.craftWeighting = 1;
            this.craftPreserve = 0;

            this.resourceRequirements = [];

            this.currentQuantity = 0;
            this.maxQuantity = 0;
            this.rateOfChange = 0;
            this.currentEject = 0;
            this.currentSupply = 0;
            this.currentDecay = 0;

            this.requestedQuantity = 0;

            this._vueBinding = "res" + id;
            this._stackVueBinding = "stack-" + id;
            this._ejectorVueBinding = "eject" + id;
            this._supplyVueBinding = "supply" + id;
            this._marketVueBinding = "market-" + id;
        }

        get title() {
            return this.instance?.name || this.name;
        }

        get instance() {
            return game.global.resource[this.id];
        }

        get id() {
            return this._id;
        }

        get currentCrates() {
            return this.instance.crates;
        }

        get currentContainers() {
            return this.instance.containers;
        }

        updateData() {
            if (!this.isUnlocked()) {
                return;
            }

            let instance = this.instance;
            this.currentQuantity = instance.amount;
            this.maxQuantity = instance.max >= 0 ? instance.max : Number.MAX_SAFE_INTEGER;
            this.rateOfChange = instance.diff;

            // When routes are managed - we're excluding trade diff from operational rate of change.
            if (settings.autoMarket && this.isTradable()) {
                this.tradeRoutes = instance.trade;
                this.tradeBuyPrice = game.tradeBuyPrice(this._id);
                this.tradeSellPrice = game.tradeSellPrice(this._id);
                this.tradeIncome = game.breakdown.p.consume[this._id].Trade || 0;
                this.rateOfChange -= this.tradeIncome;
            } else {
                this.tradeIncome = 0;
            }

            // Exclude ejected resources, so we can reuse it
            if ((settings.prestigeWhiteholeEjectEnabled || haveTask("trash")) && this.isEjectable() && buildings.BlackholeMassEjector.count > 0) {
                this.currentEject = game.global.interstellar.mass_ejector[this._id];
                this.rateOfChange += this.currentEject;
            } else {
                this.currentEject = 0;
            }

            // Same for supply
            if (settings.autoSupply && this.isSupply() && buildings.LakeTransport.count > 0) {
                this.currentSupply = game.global.portal.transport.cargo[this._id] * this.supplyVolume;
                this.rateOfChange += this.currentSupply;
            } else {
                this.currentSupply = 0;
            }

            // Restore decayed rate
            if (game.global.race['decay'] && this.tradeRouteQuantity > 0 && this.currentQuantity >= 50) {
                this.currentDecay = (this.currentQuantity - 50) * (0.001 * this.tradeRouteQuantity);
                this.rateOfChange += this.currentDecay;
            } else {
                this.currentDecay = 0;
            }
        }

        calculateRateOfChange(apply) {
            let value = this.rateOfChange;
            if ((apply.buy || apply.all) && this.tradeIncome > 0) {
                value += this.tradeIncome;
            }
            if ((apply.sell || apply.all) && this.tradeIncome < 0) {
                value += this.tradeIncome;
            }
            if (apply.eject || apply.all) {
                value -= this.currentEject;
            }
            if (apply.supply || apply.all) {
                value -= this.currentSupply;
            }
            if (apply.decay || apply.all) {
                value -= this.currentDecay;
            }
            return value;
        }

        isDemanded() {
            return this.requestedQuantity > this.currentQuantity;
        }

        get spareQuantity() {
            return this.currentQuantity - this.requestedQuantity;
        }

        get spareMaxQuantity() {
            return this.maxQuantity - this.requestedQuantity;
        }

        isUnlocked() {
            return this.instance?.display ?? false;
        }

        isMarketUnlocked() {
            let node = document.getElementById(this._marketVueBinding);
            return node !== null && node.style.display !== "none";
        }

        isManagedStorage() {
            return this.hasStorage() && this.autoStorageEnabled;
        }

        isEjectable() {
            return game.atomic_mass.hasOwnProperty(this.id);
        }

        get atomicMass() {
            return game.atomic_mass[this.id] ?? 0;
        }

        isSupply() {
            return poly.supplyValue.hasOwnProperty(this.id);
        }

        get supplyValue() {
            return poly.supplyValue[this.id]?.in ?? 0;
        }

        get supplyVolume() {
            return poly.supplyValue[this.id]?.out ?? 0;
        }

        isUseful() {
            // Spending accumulated resources
            if (!this.storeOverflow && this.currentQuantity > this.storageRequired && this.currentCrates + this.currentContainers > 0 && this.calculateRateOfChange({all: true}) < 0) {
                return false;
            }
            return this.storageRatio < 0.99 || this.isDemanded() || this.currentEject > 0 || this.currentSupply > 0 || (this.storeOverflow && (this.currentCrates < this.autoCratesMax || this.currentContainers < this.autoContainersMax));
        }

        getProduction(source) {
            let produced = 0;
            let labelFound = false;
            for (let [label, value] of Object.entries(game.breakdown.p[this._id])) {
                if (value.indexOf("%") === -1) {
                    if (labelFound) {
                        break;
                    } else if (label === game.loc(source)) {
                        labelFound = true;
                        produced += parseFloat(value) || 0;
                    }
                } else if (labelFound) {
                    produced *= 1 + (parseFloat(value) || 0) / 100;
                }
            }
            return produced * state.globalProductionModifier;
        }

        getBusyWorkers(workersSource, workersCount) {
            if (workersCount > 0) {
                let totalIncome = this.getProduction(workersSource);
                let resPerWorker = totalIncome / workersCount;
                let usedIncome = totalIncome - this.calculateRateOfChange({all: true});
                if (usedIncome > 0) {
                    return Math.ceil(usedIncome / resPerWorker);
                }
            }
            return 0;
        }

        increaseEjection(count) {
            let vue = getVueById(this._ejectorVueBinding);
            if (vue === undefined) { return false; }

            this.currentEject += count;

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                vue.ejectMore(this.id);
            }
        }

        decreaseEjection(count) {
            let vue = getVueById(this._ejectorVueBinding);
            if (vue === undefined) { return false; }

            this.currentEject -= count;

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                vue.ejectLess(this.id);
            }
        }

        increaseSupply(count) {
            let vue = getVueById(this._supplyVueBinding);
            if (vue === undefined) { return false; }

            this.currentSupply += (count * this.supplyVolume);

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                vue.supplyMore(this.id);
            }
        }

        decreaseSupply(count) {
            let vue = getVueById(this._supplyVueBinding);
            if (vue === undefined) { return false; }

            this.currentSupply -= (count * this.supplyVolume);

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                vue.supplyLess(this.id);
            }
        }

        isTradable() {
            return game.tradeRatio.hasOwnProperty(this.id) && (this.instance ? this.instance.hasOwnProperty("trade") : false);
        }

        isCraftable() {
            return game.craftCost.hasOwnProperty(this.id);
        }

        hasStorage() {
            return this.instance ? this.instance.stackable : false;
        }

        get tradeRouteQuantity() {
            return game.tradeRatio[this.id] || -1;
        }

        get storageRatio() {
            return this.maxQuantity > 0 ? this.currentQuantity / this.maxQuantity : 0;
        }

        isCapped() {
            return this.maxQuantity > 0 ? this.currentQuantity + (this.rateOfChange * gameTicksPerSecond("mid")) >= this.maxQuantity : false;
        }

        get usefulRatio() {
            if (this.maxQuantity === 0) {
                return 0;
            }
            if (this.storageRequired <= 1) {
                return 1;
            }
            return this.currentQuantity / Math.min(this.maxQuantity, this.storageRequired);
        }

        get timeToFull() {
            if (this.storageRatio > 0.98) {
                return 0; // Already full.
            }
            let totalRateOfCharge = this.calculateRateOfChange({all: true});
            if (totalRateOfCharge <= 0) {
                return Number.MAX_SAFE_INTEGER; // Won't ever fill with current rate.
            }
            return (this.maxQuantity - this.currentQuantity) / totalRateOfCharge;
        }

        get timeToRequired() {
            if (this.storageRatio > 0.98 || this.storageRequired <= 1) {
                return 0; // Already full.
            }
            let totalRateOfCharge = this.calculateRateOfChange({all: true});
            if (totalRateOfCharge <= 0) {
                return Number.MAX_SAFE_INTEGER; // Won't ever fill with current rate.
            }
            return (Math.min(this.maxQuantity, this.storageRequired) - this.currentQuantity) / totalRateOfCharge;
        }

        get autoCratesMax() {
            return this._autoCratesMax < 0 ? Number.MAX_SAFE_INTEGER : this._autoCratesMax;
        }

        get autoContainersMax() {
            return this._autoContainersMax < 0 ? Number.MAX_SAFE_INTEGER : this._autoContainersMax;
        }

        tryCraftX(count) {
            let vue = getVueById(this._vueBinding);
            if (vue === undefined) { return false; }

            resetMultiplier();
            vue.craft(this.id, count);
        }
    }

    class Supply extends Resource {
        updateData() {
            if (!this.isUnlocked()) {
                return;
            }

            this.currentQuantity = game.global.portal.purifier.supply;
            this.maxQuantity = game.global.portal.purifier.sup_max;
            this.rateOfChange = game.global.portal.purifier.diff;
        }

        isUnlocked() {
            return game.global.portal.hasOwnProperty('purifier');
        }
    }

    class Power extends Resource {
        updateData() {
            if (!this.isUnlocked()) {
                return;
            }

            this.currentQuantity = game.global.city.power;
            this.maxQuantity = Object.values(buildings).reduce((net, b) => net + (b === buildings.NeutronCitadel ? getCitadelConsumption(b.count) - getCitadelConsumption(b.stateOnCount) : b.stateOffCount * b.powered), 0);
            this.rateOfChange = game.global.city.power;
        }

        isUnlocked() {
            return game.global.city.powered;
        }
    }

    class Support extends Resource {
        // This isn't really a resource but we're going to make a dummy one so that we can treat it like a resource
        constructor(name, id, region, inRegionId) {
            super(name, id);

            this._region = region;
            this._inRegionId = inRegionId;
        }

        updateData() {
            if (!this.isUnlocked()) {
                return;
            }

            this.maxQuantity = game.global[this._region][this.supportId].s_max;
            this.currentQuantity = game.global[this._region][this.supportId].support;
            this.rateOfChange = this.maxQuantity - this.currentQuantity;
        }

        get supportId() {
            return game.actions[this._region][this._inRegionId].info.support;
        }

        get storageRatio() {
            return this.maxQuantity > 0 ? (this.maxQuantity - this.currentQuantity) / this.maxQuantity : 0;
        }

        isUnlocked() {
            return game.global[this._region][this.supportId] !== undefined;
        }
    }

    class BeltSupport extends Support {
        // Unlike other supports this one takes in account available workers
        updateData() {
            if (!this.isUnlocked()) {
                return;
            }

            let maxStations = settings.autoPower && buildings.BeltSpaceStation.autoStateEnabled ? buildings.BeltSpaceStation.count : buildings.BeltSpaceStation.stateOnCount;
            let maxWorkers = settings.autoJobs && jobs.SpaceMiner.autoJobEnabled ? state.maxSpaceMiners : jobs.SpaceMiner.count;
            this.maxQuantity = Math.min(maxStations * 3, maxWorkers);
            this.currentQuantity = game.global[this._region][this.supportId].support;
            this.rateOfChange = this.maxQuantity - this.currentQuantity;
        }
    }

    class SpecialResource extends Resource {
        updateData() {
            this.currentQuantity = game.global.race[this.id].count;
            this.maxQuantity = Number.MAX_SAFE_INTEGER;
        }

        isUnlocked() {
            return true;
        }
    }

    class AntiPlasmid extends Resource {
        updateData() {
            this.currentQuantity = game.global.race.Plasmid.anti;
            this.maxQuantity = Number.MAX_SAFE_INTEGER;
        }

        isUnlocked() {
            return true;
        }
    }

    class Population extends Resource {
        get id() {
            // The population node is special and its id will change to the race name
            return game.global.race.species;
        }
    }

    class StarPower extends Resource {
        updateData() {
            if (!this.isUnlocked()) {
                return;
            }

            this.currentQuantity = game.global.city.smelter.Star;
            this.maxQuantity = game.global.city.smelter.StarCap;
            this.rateOfChange = this.maxQuantity - this.currentQuantity;
        }

        isUnlocked() {
            return haveTech("star_forge", 2);
        }
    }

    class ResourceProductionCost {
        constructor(resource, quantity, minRateOfChange) {
            this.resource = resource;
            this.quantity = quantity;
            this.minRateOfChange = minRateOfChange;
        }
    }

    class ResourceRequirement {
        constructor(resource, quantity) {
            this.resource = resource;
            this.quantity = quantity;
        }
    }


    class Action {
        constructor(name, tab, id, location, flags) {
            this.name = name;
            this._tab = tab;
            this._id = id;
            this._location = location;
            this.gameMax = Number.MAX_SAFE_INTEGER;

            this._vueBinding = this._tab + "-" + this.id;

            this.autoBuildEnabled = true;
            this.autoStateEnabled = true;
            this.autoStateSmart = true;
            this._autoMax = -1;

            this._weighting = 100;
            this.weighting = 0;
            this.extraDescription = "";

            this.priority = 0;

            this.consumption = [];

            this.resourceRequirements = [];

            this.overridePowered = undefined;

            // Additional flags
            this.is = normalizeProperties(flags) ?? {};
        }

        get definition() {
            if (this._location !== "") {
                return game.actions[this._tab][this._location][this._id];
            } else {
                return game.actions[this._tab][this._id];
            }
        }

        get instance() {
            return game.global[this._tab][this._id];
        }

        get id() {
            return this._id;
        }

        get title() {
            let def = this.definition;
            return def ? typeof def.title === 'function' ? def.title() : def.title : this.name;
        }

        get desc() {
            let def = this.definition;
            return def ? typeof def.desc === 'function' ? def.desc() : def.desc : this.name;
        }

        get vue() {
            return getVueById(this._vueBinding);
        }

        get autoMax() {
            // There is a game max. eg. world collider can only be built 1859 times
            return this._autoMax >= 0 && this._autoMax <= this.gameMax ? this._autoMax : this.gameMax;
        }

        isUnlocked() {
            return document.getElementById(this._vueBinding) !== null;
        }

        isSwitchable() {
            return this.definition.hasOwnProperty("powered") || this.definition.hasOwnProperty("switchable");
        }

        isMission() {
            return this.definition.hasOwnProperty("grant");
        }

        isComplete() {
            return haveTech(this.definition.grant[0], this.definition.grant[1]);
        }

        isSmartManaged() {
            return settings.autoPower && this.isUnlocked() && this.autoStateEnabled && this.autoStateSmart;
        }

        isAutoBuildable() {
            return settings.autoBuild && this.isUnlocked() && this.autoBuildEnabled && this._weighting > 0 && this.count < this.autoMax;
        }

        // export function checkPowerRequirements(c_action) from actions.js
        checkPowerRequirements(def) {
            for (let [tech, value] of Object.entries(this.definition.power_reqs ?? {})) {
                if (!haveTech(tech, value)){
                    return false;
                }
            }
            return true;
        }

        get powered() {
            if (this.overridePowered !== undefined) {
                return this.overridePowered;
            }

            if (!this.definition.hasOwnProperty("powered") || !this.checkPowerRequirements()) {
                return 0;
            }

            return this.definition.powered();
        }

        updateResourceRequirements() {
            if (!this.isUnlocked()) {
                return;
            }

            this.resourceRequirements = [];
            // TODO: Check and cache affordability, calls to game.checkAffordable during weighting it's current performance bottleneck
            let adjustedCosts = poly.adjustCosts(this.definition.cost);
            for (let resourceName in adjustedCosts) {
                if (resources[resourceName]) {
                    let resourceAmount = Number(adjustedCosts[resourceName]());
                    if (resourceAmount > 0) {
                        this.resourceRequirements.push(new ResourceRequirement(resources[resourceName], resourceAmount));
                    }

                    if (resourceName === "Elerium") state.eleriumCosts.push(resourceAmount);
                }
            }
        }

        isAffordable(max = false) {
            return game.checkAffordable(this.definition, max);
        }

        // Whether the action is clickable is determined by whether it is unlocked, affordable and not a "permanently clickable" action
        isClickable() {
            return this.isUnlocked() && this.isAffordable() && this.count < this.gameMax;
        }

        // This is a "safe" click. It will only click if the container is currently clickable.
        // ie. it won't bypass the interface and click the node if it isn't clickable in the UI.
        click() {
            if (!this.isClickable()) {
                return false
            }

            this.resourceRequirements.forEach(requirement =>
                requirement.resource.currentQuantity -= requirement.quantity
            );

            // Don't log evolution actions and gathering actions
            if (game.global.race.species !== "protoplasm" && !logIgnore.includes(this.id)) {
                if (this.gameMax < Number.MAX_SAFE_INTEGER && this.count + 1 < this.gameMax) {
                    GameLog.logSuccess(GameLog.Types.multi_construction, poly.loc('build_success', [`${this.title} (${this.count + 1})`]));
                } else {
                    GameLog.logSuccess(GameLog.Types.construction, poly.loc('build_success', [this.title]));
                }
            }

            resetMultiplier();

            // TODO: Priest unlocked upon hovering... Remove once fixed in game.
            if (this === buildings.Temple || this === buildings.RedZiggurat) {
                this.definition.effect();
            }

            // Hide active popper from action, so it won't rewrite it
            let popper = $('#popper');
            if (popper.length > 0 && popper.data('id').indexOf(this._vueBinding) === -1) {
                popper.attr('id', 'TotallyNotAPopper');
                this.vue.action();
                popper.attr('id', 'popper');
            } else {
                this.vue.action();
            }

            return true;
        }

        addResourceConsumption(resource, rate) {
            this.consumption.push(normalizeProperties({ resource: resource, rate: rate }));
        }

        getMissingConsumption() {
            for (let j = 0; j < this.consumption.length; j++) {
                let resource = this.consumption[j].resource;
                if (resource instanceof Support) {
                    continue;
                }

                // Food fluctuate a lot, ignore it, assuming we always can get more
                if (resource === resources.Food && settings.autoJobs && (jobs.Farmer.autoJobEnabled || jobs.Hunter.autoJobEnabled)) {
                    continue;
                }

                // Adjust fuel
                let consumptionRate = this.consumption[j].rate;
                if (this._tab === "space" && (resource === resources.Oil || resource === resources.Helium_3)) {
                    consumptionRate = game.fuel_adjust(consumptionRate, true);
                }
                if (this._tab === "interstellar" && (resource === resources.Deuterium || resource === resources.Helium_3) && this !== buildings.AlphaFusion) {
                    consumptionRate = game.int_fuel_adjust(consumptionRate);
                }

                // Now let's actually check it
                if (resource.storageRatio < 0.95 && consumptionRate > 0 && resource.rateOfChange < consumptionRate) {
                    return resource;
                }
            }
            return null;
        }

        getMissingSupport() {
            // We're going to build Spire things with no support, to enable them later
            if ((this === buildings.SpirePort || this === buildings.SpireBaseCamp || this === buildings.SpireMechBay) && this.autoStateSmart) {
                return null;
            }

            for (let j = 0; j < this.consumption.length; j++) {
                let resource = this.consumption[j].resource;
                let rate = this.consumption[j].rate;
                if (!(resource instanceof Support) || rate <= 0) {
                    continue;
                }

                // We don't have spare support for this
                if (resource.rateOfChange < rate) {
                    return resource;
                }
            }
            return null;
        }

        getUselessSupport() {
            // Starbase and Habitats are exceptions, they're always useful
            if (this === buildings.GatewayStarbase || this === buildings.AlphaHabitat || this === buildings.StargateTelemetryBeacon) {
                return null;
            }

            let uselessSupports = [];
            for (let j = 0; j < this.consumption.length; j++) {
                let resource = this.consumption[j].resource;
                let rate = this.consumption[j].rate;
                if (!(resource instanceof Support) || rate >= 0) {
                    continue;
                }
                let minSupport = resource == resources.Belt_Support ? 2 : resource == resources.Gateway_Support ? 5 : 1;

                if (resource.rateOfChange >= minSupport) {
                    uselessSupports.push(resource);
                } else {
                    // If we have something useful - stop here, we care only about buildings with all suppors useless
                    return null;
                }
            }
            return uselessSupports[0] ?? null;
        }

        get count() {
            if (!this.isUnlocked()) {
                return 0;
            }

            return this.instance?.count ?? 0;
        }

        hasState() {
            if (!this.isUnlocked()) {
                return false;
            }

            return (this.definition.powered && haveTech("high_tech", 2) && this.checkPowerRequirements()) || this.definition.switchable?.() || false;
        }

        get stateOnCount() {
            if (!this.hasState() || this.count < 1) {
                return 0;
            }

            return this.instance.on;
        }

        get stateOffCount() {
            if (!this.hasState() || this.count < 1) {
                return 0;
            }

            return this.instance.count - this.instance.on;
        }

        tryAdjustState(adjustCount) {
            if (adjustCount === 0 || !this.hasState()) {
                return false;
            }

            let vue = this.vue;

            if (adjustCount > 0) {
                resetMultiplier();
                for (let i = 0; i < adjustCount; i++) {
                    vue.power_on();
                }
                return true;
            }

            if (adjustCount < 0) {
                resetMultiplier();
                for (let i = 0; i > adjustCount; i--) {
                    vue.power_off();
                }
                return true;
            }
        }
    }

    class ForgeHorseshoe extends Action {
        get count() {
            return resources.Horseshoe.currentQuantity;
        }
    }

    class EvolutionAction extends Action {
        isUnlocked() {
            let node = document.getElementById(this._vueBinding);
            return node !== null && !node.classList.contains('is-hidden');
        }
    }

    class SpaceDock extends Action {
        isOptionsCached() {
            if (this.count < 1 || game.global.tech['genesis'] < 4) {
                // It doesn't have options yet so I guess all "none" of them are cached!
                // Also return true if we don't have the required tech level yet
                return true;
            }

            // If our tech is unlocked but we haven't cached the vue the the options aren't cached
            if (!buildings.GasSpaceDockProbe.isOptionsCached()
                || game.global.tech['genesis'] >= 5 && !buildings.GasSpaceDockShipSegment.isOptionsCached()
                || game.global.tech['genesis'] === 6 && !buildings.GasSpaceDockPrepForLaunch.isOptionsCached()
                || game.global.tech['genesis'] >= 7 && !buildings.GasSpaceDockLaunch.isOptionsCached()) {
                return false;
            }

            return true;
        }

        cacheOptions() {
            if (this.count < 1 || WindowManager.isOpen()) {
                return false;
            }

            let optionsNode = document.querySelector("#space-star_dock .special");
            let title = typeof game.actions.space.spc_gas.star_dock.title === 'function' ? game.actions.space.spc_gas.star_dock.title() : game.actions.space.spc_gas.star_dock.title;
            WindowManager.openModalWindowWithCallback(optionsNode, title, () => {
                buildings.GasSpaceDockProbe.cacheOptions();
                buildings.GasSpaceDockShipSegment.cacheOptions();
                buildings.GasSpaceDockPrepForLaunch.cacheOptions();
                buildings.GasSpaceDockLaunch.cacheOptions();
            });
            return true;
        }
    }

    class ModalAction extends Action {
        constructor(...args) {
            super(...args);

            this._vue = undefined;
        }

        get vue() {
            return this._vue;
        }

        isOptionsCached() {
            return this.vue !== undefined;
        }

        cacheOptions() {
            this._vue = getVueById(this._vueBinding);
        }

        isUnlocked() {
            // We have to override this as there won't be an element unless the modal window is open
            return this._vue !== undefined;
        }
    }

    class Project extends Action {
        constructor(name, id) {
            super(name, "arpa", id, "");
            this._vueBinding = "arpa" + this.id;
            this.currentStep = 1;
        }

        updateResourceRequirements() {
            if (!this.isUnlocked()) {
                return;
            }

            this.resourceRequirements = [];
            let maxStep = Math.min(100 - this.progress, state.triggerTargets.includes(this) ? 100 : settings.arpaStep);

            let adjustedCosts = poly.arpaAdjustCosts(this.definition.cost);
            for (let resourceName in adjustedCosts) {
                if (resources[resourceName]) {
                    let resourceAmount = Number(adjustedCosts[resourceName]());
                    if (resourceAmount > 0) {
                        maxStep = Math.min(maxStep, resources[resourceName].maxQuantity / (resourceAmount / 100));
                        this.resourceRequirements.push(new ResourceRequirement(resources[resourceName], resourceAmount / 100));
                    }
                }
            }

            this.currentStep = Math.max(Math.floor(maxStep), 1);
            if (this.currentStep > 1) {
                this.resourceRequirements.forEach(req => req.quantity *= this.currentStep);
            }
        }

        get count() {
            return this.instance?.rank ?? 0;
        }

        get progress() {
            return this.instance?.complete ?? 0;
        }

        isAffordable(max = false) {
            // We can't use exposed checkAffordable with projects, so let's write it. Luckily project need only basic resources
            let check = max ? "maxQuantity" : "currentQuantity";
            for (let i = 0; i < this.resourceRequirements.length; i++) {
                let req = this.resourceRequirements[i];
                if (req.resource[check] < req.quantity) {
                    return false;
                }
            }
            return true;
        }

        isClickable() {
            return this.isUnlocked() && this.isAffordable(false);
        }

        click() {
            if (!this.isClickable()) {
                return false
            }

            this.resourceRequirements.forEach(requirement =>
                requirement.resource.currentQuantity -= requirement.quantity
            );

            if (this.progress + this.currentStep < 100) {
                GameLog.logSuccess(GameLog.Types.arpa, poly.loc('build_success', [`${this.title} (${this.progress + this.currentStep}%)`]));
            } else {
                GameLog.logSuccess(GameLog.Types.construction, poly.loc('build_success', [this.title]));
            }

            resetMultiplier();
            getVueById(this._vueBinding).build(this.id, this.currentStep);
            return true;
        }
    }

    class Technology {
        constructor(id) {
            this._id = id;

            this._vueBinding = "tech-" + id;

            this.resourceRequirements = [];
        }

        get id() {
            return this._id;
        }

        isUnlocked() {
            // vue of researched techs still can be found in #oldTech
            return document.querySelector("#" + this._vueBinding + " > a") !== null && getVueById(this._vueBinding) !== undefined;
        }

        get definition() {
            return game.actions.tech[this._id];
        }

        get title() {
            return typeof this.definition.title === 'function' ? this.definition.title() : this.definition.title;
        }

        get name() {
            return this.title;
        }

        isAffordable(max = false) {
            return game.checkAffordable(this.definition, max);
        }

        // Whether the action is clickable is determined by whether it is unlocked, affordable and not a "permanently clickable" action
        isClickable() {
            return this.isUnlocked() && this.isAffordable();
        }

        // This is a "safe" click. It will only click if the container is currently clickable.
        // ie. it won't bypass the interface and click the node if it isn't clickable in the UI.
        click() {
            if (!this.isClickable()) {
                return false
            }

            this.resourceRequirements.forEach(requirement =>
                requirement.resource.currentQuantity -= requirement.quantity
            );

            getVueById(this._vueBinding).action();
            GameLog.logSuccess(GameLog.Types.research, poly.loc('research_success', [techIds[this.definition.id].title]));
            return true;
        }

        isResearched() {
            return document.querySelector("#tech-" + this.id + " .oldTech") !== null;
        }

        updateResourceRequirements() {
            if (!this.isUnlocked()) {
                return;
            }

            this.resourceRequirements = [];

            let adjustedCosts = poly.adjustCosts(this.definition.cost);
            for (let resourceName in adjustedCosts) {
                if (resources[resourceName]) {
                    let resourceAmount = Number(adjustedCosts[resourceName]());
                    if (resourceAmount > 0) {
                        this.resourceRequirements.push(new ResourceRequirement(resources[resourceName], resourceAmount));
                    }

                    if (resourceName === "Elerium") state.eleriumCosts.push(resourceAmount);
                }
            }
        }
    }

    class Race {
        constructor(id) {
            this.id = id;
            this.evolutionTree = [];
        }

        get name() {
            return game.races[this.id].name ?? "Custom";
        }

        get desc() {
            return game.races[this.id].desc ?? "Custom";
        }

        get genus() {
            return game.races[this.id].type;
        }

        getHabitability() {
            if (this.id === "junker") {
                return game.global.genes.challenge ? 1 : 0;
            }

            switch (this.genus) {
                case "aquatic":
                    return game.global.city.biome === 'oceanic' ? 1 : getUnsuitedMod();
                case "fey":
                    return game.global.city.biome === 'forest' ? 1 : getUnsuitedMod();
                case "sand":
                    return game.global.city.biome === 'desert' ? 1 : getUnsuitedMod();
                case "heat":
                    return game.global.city.biome === 'volcanic' ? 1 : getUnsuitedMod();
                case "polar":
                    return game.global.city.biome === 'tundra' ? 1 : getUnsuitedMod();
                case "demonic":
                    return game.global.city.biome === 'hellscape' ? 1 : game.global.blood.unbound >= 3 ? getUnsuitedMod() : 0;
                case "angelic":
                    return game.global.city.biome === 'eden' ? 1 : game.global.blood.unbound >= 3 ? getUnsuitedMod() : 0;
                case undefined: // Nonexistent custom
                    return 0;
                default:
                    return 1;
            }
        }

        getCondition() {
            if (this.id === "junker") {
                return "Challenge genes unlocked";
            }

            switch (this.genus) {
                case "aquatic":
                    return "Oceanic planet";
                case "fey":
                    return "Forest planet";
                case "sand":
                    return "Desert planet";
                case "heat":
                    return "Volcanic planet";
                case "polar":
                    return "Tundra planet";
                case "demonic":
                    return "Hellscape planet";
                case "angelic":
                    return "Eden planet";
                case undefined: // Nonexistent custom
                    return "Custom designed race";
                default:
                    return "";
            }
        }

        isMadAchievementUnlocked(level) {
            return isAchievementUnlocked("extinct_" + this.id, level);
        }

        isGreatnessAchievementUnlocked(level) {
            return isAchievementUnlocked("genus_" + this.genus, level);
        }

        isPillarUnlocked(level) {
            return game.global.pillars[this.id] >= level;
        }
    }

    class Trigger {
        constructor(seq, priority, requirementType, requirementId, requirementCount, actionType, actionId, actionCount) {
            this.seq = seq;
            this.priority = priority;

            this.requirementType = requirementType;
            this.requirementId = requirementId;
            this.requirementCount = requirementCount;

            this.actionType = actionType;
            this.actionId = actionId;
            this.actionCount = actionCount;

            this.complete = false;
        }

        cost() {
            if (this.actionType === "research") {
                return techIds[this.actionId].definition.cost;
            }
            if (this.actionType === "build") {
                return buildingIds[this.actionId].definition.cost;
            }
            if (this.actionType === "arpa") {
                return arpaIds[this.actionId].definition.cost;
            }
            return {};
        }

        isActionPossible() {
            // check against MAX as we want to know if it is possible...
            let obj = null;
            if (this.actionType === "research") {
                obj = techIds[this.actionId];
            }
            if (this.actionType === "build") {
                obj = buildingIds[this.actionId];
            }
            if (this.actionType === "arpa") {
                obj = arpaIds[this.actionId];
            }
            return obj && obj.isUnlocked() && obj.isAffordable(true);
        }

        updateComplete() {
            if (this.complete) {
                return false;
            }

            if (this.actionType === "research" && techIds[this.actionId].isResearched()) {
                this.complete = true;
                return true;
            }
            if (this.actionType === "build" && buildingIds[this.actionId].count >= this.actionCount) {
                this.complete = true;
                return true;
            }
            if (this.actionType === "arpa" && arpaIds[this.actionId].count >= this.actionCount) {
                this.complete = true;
                return true;
            }
            return false;
        }

        areRequirementsMet() {
            if (this.requirementType === "unlocked" && techIds[this.requirementId].isUnlocked()) {
                return true;
            }
            if (this.requirementType === "researched" && techIds[this.requirementId].isResearched()) {
                return true;
            }
            if (this.requirementType === "built" && (buildingIds[this.requirementId].isMission() ? Number(buildingIds[this.requirementId].isComplete()) : buildingIds[this.requirementId].count) >= this.requirementCount) {
                return true;
            }
            return false;
        }

        updateRequirementType(requirementType) {
            if (requirementType === this.requirementType) {
                return;
            }

            let oldType = this.requirementType;
            this.requirementType = requirementType;
            this.complete = false;

            if ((this.requirementType === "unlocked" || this.requirementType === "researched") &&
                (oldType === "unlocked" || oldType === "researched")) {
                return; // Both researches, old ID is still valid, and preserved.
            }

            if (this.requirementType === "unlocked" || this.requirementType === "researched") {
                this.requirementId = "tech-club";
                this.requirementCount = 0;
                return;
            }

            if (this.requirementType === "built") {
                this.requirementId = "city-basic_housing";
                this.requirementCount = 1;
                return;
            }
        }

        updateRequirementId(requirementId) {
            if (requirementId === this.requirementId) {
                return;
            }

            this.requirementId = requirementId;
            this.complete = false;
        }

        updateRequirementCount(requirementCount) {
            if (requirementCount === this.requirementCount) {
                return;
            }

            this.requirementCount = requirementCount;
            this.complete = false;
        }

        updateActionType(actionType) {
            if (actionType === this.actionType) {
                return;
            }

            this.actionType = actionType;
            this.complete = false;

            if (this.actionType === "research") {
                this.actionId = "tech-club";
                this.actionCount = 0;
                return;
            }
            if (this.actionType === "build") {
                this.actionId = "city-basic_housing";
                this.actionCount = 1;
                return;
            }
            if (this.actionType === "arpa") {
                this.actionId = "arpalhc";
                this.actionCount = 1;
                return;
            }
        }

        updateActionId(actionId) {
            if (actionId === this.actionId) {
                return;
            }

            this.actionId = actionId;
            this.complete = false;
        }

        updateActionCount(actionCount) {
            if (actionCount === this.actionCount) {
                return;
            }

            this.actionCount = actionCount;
            this.complete = false;
        }
    }

    class MinorTrait {
        constructor(traitName) {
            this.traitName = traitName;

            this.priority = 0;
            this.enabled = true;
            this.weighting = 0;
        }

        isUnlocked() {
            return game.global.settings.mtorder.includes(this.traitName);
        }

        geneCount() {
            return game.global.race.minor[this.traitName] ?? 0;
        }

        phageCount() {
            return game.global.genes.minor[this.traitName] ?? 0;
        }

        totalCount() {
            return game.global.race[this.traitName] ?? 0;
        }

        geneCost() {
            return this.traitName === 'mastery' ? Fibonacci(this.geneCount()) * 5 : Fibonacci(this.geneCount());
        }
    }

    // Script constants

    // Fibonacci numbers starting from "5"
    const Fibonacci = ((m) => (n) => m[n] ?? (m[n] = Fibonacci(n-1) + Fibonacci(n-2)))([5,8]);

    const numberSuffix = {
        K: 1000,
        M: 1000000,
        G: 1000000000,
        T: 1000000000000,
        P: 1000000000000000,
        E: 1000000000000000000,
        Z: 1000000000000000000000,
        Y: 1000000000000000000000000,
    }

    // All minor traits and the currently two special traits
    const minorTraits = ["tactical", "analytical", "promiscuous", "resilient", "cunning", "hardy", "ambidextrous", "industrious", "content", "fibroblast", "metallurgist", "gambler", "persuasive", "fortify", "mastery"];

    const universes = ['standard','heavy','antimatter','evil','micro','magic'];

    // Biomes, traits and geologies in natural order
    const biomeList = ['grassland', 'oceanic', 'forest', 'desert', 'volcanic', 'tundra', 'hellscape', 'eden'];
    const traitList = ['none', 'toxic', 'mellow', 'rage', 'stormy', 'ozone', 'magnetic', 'trashed', 'elliptical', 'flare', 'dense', 'unstable'];
    const extraList = ['Achievement', 'Copper', 'Iron', 'Aluminium', 'Coal', 'Oil', 'Titanium', 'Uranium', 'Iridium'];

    // Biomes and traits sorted by habitability
    const planetBiomes = ["oceanic", "forest", "grassland", "desert", "volcanic", "tundra", "eden", "hellscape"];
    const planetTraits = ["magnetic", "elliptical", "none", "rage", "stormy", "toxic", "ozone", "trashed", "dense", "unstable", "mellow", "flare"];
    const planetBiomeGenus = {hellscape: "demonic", eden: "angelic", oceanic: "aquatic", forest: "fey", desert: "sand", volcanic: "heat", tundra: "polar"};
    const fanatAchievements = [{god: 'sharkin', race: 'entish', achieve: 'madagascar_tree'},
                               {god: 'sporgar', race: 'human', achieve: 'infested'},
                               {god: 'shroomi', race: 'troll', achieve: 'godwin'}];

    const challenges = [
        [{id:"plasmid", trait:"no_plasmid"},
         {id:"mastery", trait:"weak_mastery"},
       /*{id:"nerfed", trait:"nerfed"}*/],
        [{id:"crispr", trait:"no_crispr"},
       /*{id:"badgenes", trait:"badgenes"}*/],
        [{id:"trade", trait:"no_trade"}],
        [{id:"craft", trait:"no_craft"}],
        [{id:"joyless", trait:"joyless"}],
        [{id:"steelen", trait:"steelen"}],
        [{id:"decay", trait:"decay"}],
        [{id:"emfield", trait:"emfield"}],
        [{id:"junker", trait:"junker"}],
        [{id:"cataclysm", trait:"cataclysm"}],
        [{id:"banana", trait:"banana"}],
      //[{id:"truepath", trait:"truepath"}],
    ];
    const governors = ["soldier", "criminal", "entrepreneur", "educator", "spiritual", "bluecollar", "noble", "media", "sports", "bureaucrat"];
    const evolutionSettingsToStore = ["userEvolutionTarget", "prestigeType", ...challenges.map(c => "challenge_" + c[0].id)];
    const prestigeNames = {mad: "MAD", bioseed: "Bioseed", cataclysm: "Cataclysm", vacuum: "Vacuum", whitehole: "Whitehole", ascension: "Ascension", demonic: "Infusion"};
    const logIgnore = ["food", "lumber", "stone", "chrysotile", "slaughter", "s_alter", "slave_market", "horseshoe"];
    const galaxyRegions = ["gxy_stargate", "gxy_gateway", "gxy_gorddon", "gxy_alien1", "gxy_alien2", "gxy_chthonian"];
    const settingsSections = ["general", "prestige", "evolution", "research", "market", "storage", "production", "war", "hell", "fleet", "job", "building", "project", "government", "logging", "minorTrait", "weighting", "ejector", "planet", "mech"];
    const unlimitedJobs = ["unemployed", "hunter", "farmer", "lumberjack", "quarry_worker", "crystal_miner", "scavenger", "forager"]; // this.definition.max holds zero at evolution stage, and that can mess with settings gui

    // Lookup tables, will be filled on init
    var techIds = {};
    var buildingIds = {};
    var arpaIds = {};
    var evolutions = {};
    var races = {};
    var resourcesByAtomicMass = [];
    var resourcesBySupplyValue = [];

    // State variables
    var state = {
        game: null,
        scriptTick: 1,
        multiplierTick: 0,
        buildingToggles: 0,
        evolutionAttempts: 0,

        lastWasteful: null,
        lastLumber: null,
        lastShowMarket: null,
        lastShowRoutes: null,
        lastShowEjector: null,
        lastShowCargo: null,
        lastHaveCrate: null,
        lastHaveContainer: null,
        lastPopulationCount: 0,
        lastFarmerCount: 0,

        warnDebug: true,
        warnPreload: true,

        // We need to keep them separated, as we *don't* want to click on queue targets. Game will handle that. We're just managing resources for them.
        queuedTargets: [],
        triggerTargets: [],
        otherTargets: [],

        maxSpaceMiners: 0,
        globalProductionModifier: 1,
        moneyIncomes: new Array(11).fill(0),
        moneyMedian: 0,
        soulGemIncomes: [{tick: 0, gems: 0}],
        soulGemLast: Number.MAX_SAFE_INTEGER,

        knowledgeRequiredByTechs: 0,

        goal: "Standard",

        craftableResourceList: [],
        missionBuildingList: [],
        filterRegExp: null,
        evolutionTarget: null,

        eleriumCosts: []
    };

    // Class instances
    var resources = { // Resources order follow game order, and used to initialize priorities
        // Evolution resources
        RNA: new Resource("RNA", "RNA"),
        DNA: new Resource("DNA", "DNA"),

        // Base resources
        Money: new Resource("Money", "Money"),
        Population: new Population("Population", "Population"), // We can't store the full elementId because we don't know the name of the population node until later
        Slave: new Resource("Slave", "Slave"),
        Mana: new Resource("Mana", "Mana"),
        Knowledge: new Resource("Knowledge", "Knowledge"),
        Zen: new Resource("Zen", "Zen"),
        Crates: new Resource("Crates", "Crates"),
        Containers: new Resource("Containers", "Containers"),

        // Basic resources (can trade for these)
        Food: new Resource("Food", "Food"),
        Lumber: new Resource("Lumber", "Lumber"),
        Chrysotile: new Resource("Chrysotile", "Chrysotile"),
        Stone: new Resource("Stone", "Stone"),
        Crystal: new Resource("Crystal", "Crystal"),
        Furs: new Resource("Furs", "Furs"),
        Copper: new Resource("Copper", "Copper"),
        Iron: new Resource("Iron", "Iron"),
        Aluminium: new Resource("Aluminium", "Aluminium"),
        Cement: new Resource("Cement", "Cement"),
        Coal: new Resource("Coal", "Coal"),
        Oil: new Resource("Oil", "Oil"),
        Uranium: new Resource("Uranium", "Uranium"),
        Steel: new Resource("Steel", "Steel"),
        Titanium: new Resource("Titanium", "Titanium"),
        Alloy: new Resource("Alloy", "Alloy"),
        Polymer: new Resource("Polymer", "Polymer"),
        Iridium: new Resource("Iridium", "Iridium"),
        Helium_3: new Resource("Helium-3", "Helium_3"),

        // Advanced resources
        Deuterium: new Resource("Deuterium", "Deuterium"),
        Neutronium: new Resource("Neutronium", "Neutronium"),
        Adamantite: new Resource("Adamantite", "Adamantite"),
        Infernite: new Resource("Infernite", "Infernite"),
        Elerium: new Resource("Elerium", "Elerium"),
        Nano_Tube: new Resource("Nano Tube", "Nano_Tube"),
        Graphene: new Resource("Graphene", "Graphene"),
        Stanene: new Resource("Stanene", "Stanene"),
        Bolognium: new Resource("Bolognium", "Bolognium"),
        Vitreloy: new Resource("Vitreloy", "Vitreloy"),
        Orichalcum: new Resource("Orichalcum", "Orichalcum"),

        Horseshoe: new Resource("Horseshoe", "Horseshoe"),
        Genes: new Resource("Genes", "Genes"),
        Soul_Gem: new Resource("Soul Gem", "Soul_Gem"),

        // Craftable resources
        Plywood: new Resource("Plywood", "Plywood"),
        Brick: new Resource("Brick", "Brick"),
        Wrought_Iron: new Resource("Wrought Iron", "Wrought_Iron"),
        Sheet_Metal: new Resource("Sheet Metal", "Sheet_Metal"),
        Mythril: new Resource("Mythril", "Mythril"),
        Aerogel: new Resource("Aerogel", "Aerogel"),
        Nanoweave: new Resource("Nanoweave", "Nanoweave"),
        Scarletite: new Resource("Scarletite", "Scarletite"),

        // Magic universe update
        Corrupt_Gem: new Resource("Corrupt Gem", "Corrupt_Gem"),
        Codex: new Resource("Codex", "Codex"),
        Demonic_Essence: new Resource("Demonic Essence", "Demonic_Essence"),
        Blood_Stone: new Resource("Blood Stone", "Blood_Stone"),
        Artifact: new Resource("Artifact", "Artifact"),

        // Prestige resources
        Plasmid: new SpecialResource("Plasmid", "Plasmid"),
        Antiplasmid: new AntiPlasmid("Anti-Plasmid", "AntiPlasmid"),
        Phage: new SpecialResource("Phage", "Phage"),
        Dark: new SpecialResource("Dark", "Dark"),
        Harmony: new SpecialResource("Harmony", "Harmony"),

        // Special not-really-resources-but-we'll-treat-them-like-resources resources
        Supply: new Supply("Supplies", "Supply"),
        Power: new Power("Power", "powerMeter"),
        StarPower: new StarPower("Star Power", "StarPower"),
        Moon_Support: new Support("Moon Support", "srspc_moon", "space", "spc_moon"),
        Red_Support: new Support("Red Support", "srspc_red", "space", "spc_red"),
        Sun_Support: new Support("Sun Support", "srspc_sun", "space", "spc_sun"),
        Belt_Support: new BeltSupport("Belt Support", "srspc_belt", "space", "spc_belt"),
        //Titan_Support: new Support("Titan Support", "srspc_titan", "space", "spc_titan"),
        Alpha_Support: new Support("Alpha Support", "srint_alpha", "interstellar", "int_alpha"),
        Nebula_Support: new Support("Nebula Support", "srint_nebula", "interstellar", "int_nebula"),
        Gateway_Support: new Support("Gateway Support", "gxy_gateway", "galaxy", "gxy_gateway"),
        Alien_Support: new Support("Alien Support", "gxy_alien2", "galaxy", "gxy_alien2"),
        Lake_Support: new Support("Lake Support", "prtl_lake", "portal", "prtl_lake"),
        Spire_Support: new Support("Spire Support", "prtl_spire", "portal", "prtl_spire"),

    }

    var jobs = {
        Unemployed: new Job("unemployed", "Unemployed"),
        Hunter: new Job("hunter", "Hunter"),
        Farmer: new Job("farmer", "Farmer"),
        //Forager: new Job("forager", "Forager"),
        Lumberjack: new Job("lumberjack", "Lumberjack"),
        QuarryWorker: new Job("quarry_worker", "Quarry Worker"),
        CrystalMiner: new Job("crystal_miner", "Crystal Miner"),
        Scavenger: new Job("scavenger", "Scavenger"),

        Miner: new Job("miner", "Miner"),
        CoalMiner: new Job("coal_miner", "Coal Miner"),
        CementWorker: new Job("cement_worker", "Cement Worker"),
        Entertainer: new Job("entertainer", "Entertainer"),
        Priest: new Job("priest", "Priest"),
        Professor: new Job("professor", "Professor"),
        Scientist: new Job("scientist", "Scientist"),
        Banker: new Job("banker", "Banker"),
        Colonist: new Job("colonist", "Colonist"),
        SpaceMiner: new Job("space_miner", "Space Miner"),
        HellSurveyor: new Job("hell_surveyor", "Hell Surveyor"),
        Archaeologist: new Job("archaeologist", "Archaeologist"),

        // Crafting jobs
        Plywood: new CraftingJob("Plywood", "Plywood Crafter", resources.Plywood),
        Brick: new CraftingJob("Brick", "Brick Crafter", resources.Brick),
        WroughtIron: new CraftingJob("Wrought_Iron", "Wrought Iron Crafter", resources.Wrought_Iron),
        SheetMetal: new CraftingJob("Sheet_Metal", "Sheet Metal Crafter", resources.Sheet_Metal),
        Mythril: new CraftingJob("Mythril", "Mythril Crafter", resources.Mythril),
        Aerogel: new CraftingJob("Aerogel", "Aerogel Crafter", resources.Aerogel),
        Nanoweave: new CraftingJob("Nanoweave", "Nanoweave Crafter", resources.Nanoweave),
        Scarletite: new CraftingJob("Scarletite", "Scarletite Crafter", resources.Scarletite),
    }

    var buildings = {
        Food: new Action("Food", "city", "food", ""),
        Lumber: new Action("Lumber", "city", "lumber", ""),
        Stone: new Action("Stone", "city", "stone", ""),
        Chrysotile: new Action("Chrysotile", "city", "chrysotile", ""),
        Slaughter: new Action("Slaughter", "city", "slaughter", ""),
        ForgeHorseshoe: new ForgeHorseshoe("Horseshoe", "city", "horseshoe", "", {housing: true, garrison: true}),
        SacrificialAltar: new Action("Sacrificial Altar", "city", "s_alter", ""),
        MeditationChamber: new Action("Meditation Chamber", "city", "meditation", ""),

        University: new Action("University", "city", "university", "", {knowledge: true}),
        Wardenclyffe: new Action("Wardenclyffe", "city", "wardenclyffe", "", {knowledge: true}),
        Mine: new Action("Mine", "city", "mine", "", {smart: true}),
        CoalMine: new Action("Coal Mine", "city", "coal_mine", "", {smart: true}),
        Smelter: new Action("Smelter", "city", "smelter", ""),
        CoalPower: new Action("Coal Powerplant", "city", "coal_power", ""),
        Temple: new Action("Temple", "city", "temple", ""),
        OilWell: new Action("Oil Derrick", "city", "oil_well", ""),
        BioLab: new Action("Bioscience Lab", "city", "biolab", "", {knowledge: true}),
        StorageYard: new Action("Freight Yard", "city", "storage_yard", ""),
        Warehouse: new Action("Container Port", "city", "warehouse", ""),
        OilPower: new Action("Oil Powerplant", "city", "oil_power", ""),
        Bank: new Action("Bank", "city", "bank", ""),
        Barracks: new Action("Barracks", "city", "garrison", "", {garrison: true, smart: true}),
        Hospital: new Action("Hospital", "city", "hospital", ""),
        BootCamp: new Action("Boot Camp", "city", "boot_camp", ""),
        House: new Action("Cabin", "city", "basic_housing", "", {housing: true}),
        Cottage: new Action("Cottage", "city", "cottage", "", {housing: true}),
        Apartment: new Action("Apartment", "city", "apartment", "", {housing: true}),
        Farm: new Action("Farm", "city", "farm", "", {housing: true}),
        SoulWell: new Action("Soul Well", "city", "soul_well", ""),
        Mill: new Action("Windmill", "city", "mill", "", {smart: true}),
        Windmill: new Action("Windmill (Evil)", "city", "windmill", ""),
        Silo: new Action("Grain Silo", "city", "silo", ""),
        Shed: new Action("Shed", "city", "shed", ""),
        LumberYard: new Action("Lumber Yard", "city", "lumber_yard", ""),
        RockQuarry: new Action("Rock Quarry", "city", "rock_quarry", ""),
        CementPlant: new Action("Cement Plant", "city", "cement_plant", "", {smart: true}),
        Foundry: new Action("Foundry", "city", "foundry", ""),
        Factory: new Action("Factory", "city", "factory", ""),
        OilDepot: new Action("Fuel Depot", "city", "oil_depot", ""),
        Trade: new Action("Trade Post", "city", "trade", ""),
        Amphitheatre: new Action("Amphitheatre", "city", "amphitheatre", ""),
        Library: new Action("Library", "city", "library", "", {knowledge: true}),
        Sawmill: new Action("Sawmill", "city", "sawmill", ""),
        FissionPower: new Action("Fission Reactor", "city", "fission_power", ""),
        Lodge: new Action("Lodge", "city", "lodge", "", {housing: true}),
        Smokehouse: new Action("Smokehouse", "city", "smokehouse", ""),
        Casino: new Action("Casino", "city", "casino", ""),
        TouristCenter: new Action("Tourist Center", "city", "tourist_center", "", {smart: true}),
        MassDriver: new Action("Mass Driver", "city", "mass_driver", "", {knowledge: () => haveTech("mass", 2)}),
        Wharf: new Action("Wharf", "city", "wharf", ""),
        MetalRefinery: new Action("Metal Refinery", "city", "metal_refinery", ""),
        SlavePen: new Action("Slave Pen", "city", "slave_pen", ""),
        SlaveMarket: new Action("Slave Market", "city", "slave_market", ""),
        Graveyard: new Action ("Graveyard", "city", "graveyard", ""),
        Shrine: new Action ("Shrine", "city", "shrine", ""),
        CompostHeap: new Action("Compost Heap", "city", "compost", ""),
        Pylon: new Action("Pylon", "city", "pylon", ""),

        SpaceTestLaunch: new Action("Space Test Launch", "space", "test_launch", "spc_home"),
        SpaceSatellite: new Action("Space Satellite", "space", "satellite", "spc_home", {knowledge: true}),
        SpaceGps: new Action("Space Gps", "space", "gps", "spc_home"),
        SpacePropellantDepot: new Action("Space Propellant Depot", "space", "propellant_depot", "spc_home"),
        SpaceNavBeacon: new Action("Space Navigation Beacon", "space", "nav_beacon", "spc_home"),

        MoonMission: new Action("Moon Mission", "space", "moon_mission", "spc_moon"),
        MoonBase: new Action("Moon Base", "space", "moon_base", "spc_moon"),
        MoonIridiumMine: new Action("Moon Iridium Mine", "space", "iridium_mine", "spc_moon"),
        MoonHeliumMine: new Action("Moon Helium-3 Mine", "space", "helium_mine", "spc_moon"),
        MoonObservatory: new Action("Moon Observatory", "space", "observatory", "spc_moon", {knowledge: true}),

        RedMission: new Action("Red Mission", "space", "red_mission", "spc_red"),
        RedSpaceport: new Action("Red Spaceport", "space", "spaceport", "spc_red"),
        RedTower: new Action("Red Space Control", "space", "red_tower", "spc_red"),
        RedLivingQuarters: new Action("Red Living Quarters", "space", "living_quarters", "spc_red", {housing: true}),
        RedVrCenter: new Action("Red VR Center", "space", "vr_center", "spc_red"),
        RedGarage: new Action("Red Garage", "space", "garage", "spc_red"),
        RedMine: new Action("Red Mine", "space", "red_mine", "spc_red"),
        RedFabrication: new Action("Red Fabrication", "space", "fabrication", "spc_red"),
        RedFactory: new Action("Red Factory", "space", "red_factory", "spc_red"),
        RedBiodome: new Action("Red Biodome", "space", "biodome", "spc_red"),
        RedExoticLab: new Action("Red Exotic Materials Lab", "space", "exotic_lab", "spc_red", {knowledge: true}),
        RedZiggurat: new Action("Red Ziggurat", "space", "ziggurat", "spc_red"),
        RedSpaceBarracks: new Action("Red Marine Barracks", "space", "space_barracks", "spc_red", {garrison: true}),
        RedForgeHorseshoe: new ForgeHorseshoe("Red Horseshoe (Cataclysm)", "space", "horseshoe", "spc_red", {housing: true, garrison: true}),

        HellMission: new Action("Hell Mission", "space", "hell_mission", "spc_hell"),
        HellGeothermal: new Action("Hell Geothermal Plant", "space", "geothermal", "spc_hell"),
        HellSpaceCasino: new Action("Hell Space Casino", "space", "spc_casino", "spc_hell"),
        HellSwarmPlant: new Action("Hell Swarm Plant", "space", "swarm_plant", "spc_hell"),

        SunMission: new Action("Sun Mission", "space", "sun_mission", "spc_sun"),
        SunSwarmControl: new Action("Sun Control Station", "space", "swarm_control", "spc_sun"),
        SunSwarmSatellite: new Action("Sun Swarm Satellite", "space", "swarm_satellite", "spc_sun"),

        GasMission: new Action("Gas Mission", "space", "gas_mission", "spc_gas"),
        GasMining: new Action("Gas Helium-3 Collector", "space", "gas_mining", "spc_gas", {smart: true}),
        GasStorage: new Action("Gas Fuel Depot", "space", "gas_storage", "spc_gas"),
        GasSpaceDock: new SpaceDock("Gas Space Dock", "space", "star_dock", "spc_gas"),
        GasSpaceDockProbe: new ModalAction("Gas Space Probe", "starDock", "probes", ""),
        GasSpaceDockShipSegment: new ModalAction("Gas Bioseeder Ship Segment", "starDock", "seeder", ""),
        GasSpaceDockPrepForLaunch: new ModalAction("Gas Prep Ship", "starDock", "prep_ship", ""),
        GasSpaceDockLaunch: new ModalAction("Gas Launch Ship", "starDock", "launch_ship", ""),

        GasMoonMission: new Action("Gas Moon Mission", "space", "gas_moon_mission", "spc_gas_moon"),
        GasMoonOutpost: new Action("Gas Moon Mining Outpost", "space", "outpost", "spc_gas_moon"),
        GasMoonDrone: new Action("Gas Moon Mining Drone", "space", "drone", "spc_gas_moon"),
        GasMoonOilExtractor: new Action("Gas Moon Oil Extractor", "space", "oil_extractor", "spc_gas_moon", {smart: true}),

        BeltMission: new Action("Belt Mission", "space", "belt_mission", "spc_belt"),
        BeltSpaceStation: new Action("Belt Space Station", "space", "space_station", "spc_belt", {smart: true}),
        BeltEleriumShip: new Action("Belt Elerium Mining Ship", "space", "elerium_ship", "spc_belt", {smart: true}),
        BeltIridiumShip: new Action("Belt Iridium Mining Ship", "space", "iridium_ship", "spc_belt", {smart: true}),
        BeltIronShip: new Action("Belt Iron Mining Ship", "space", "iron_ship", "spc_belt", {smart: true}),

        DwarfMission: new Action("Dwarf Mission", "space", "dwarf_mission", "spc_dwarf"),
        DwarfEleriumContainer: new Action("Dwarf Elerium Storage", "space", "elerium_contain", "spc_dwarf", {smart: true}),
        DwarfEleriumReactor: new Action("Dwarf Elerium Reactor", "space", "e_reactor", "spc_dwarf"),
        DwarfWorldCollider: new Action("Dwarf World Collider", "space", "world_collider", "spc_dwarf"),
        DwarfWorldController: new Action("Dwarf World Collider (Complete)", "space", "world_controller", "spc_dwarf", {knowledge: true}),
        /*
        DwarfShipyard: new Action("Dwarf Ship Yard", "space", "shipyard", "spc_dwarf"),
        TitanMission: new Action("Titan Mission", "space", "titan_mission", "spc_titan"),
        TitanSpaceport: new Action("Titan Spaceport", "space", "titan_spaceport", "spc_titan"),
        EnceladusMission: new Action("Enceladus Mission", "space", "enceladus_mission", "spc_enceladus"),
        */
        AlphaMission: new Action("Alpha Centauri Mission", "interstellar", "alpha_mission", "int_alpha"),
        AlphaStarport: new Action("Alpha Starport", "interstellar", "starport", "int_alpha"),
        AlphaHabitat: new Action("Alpha Habitat", "interstellar", "habitat", "int_alpha", {housing: true}),
        AlphaMiningDroid: new Action("Alpha Mining Droid", "interstellar", "mining_droid", "int_alpha"),
        AlphaProcessing: new Action("Alpha Processing Facility", "interstellar", "processing", "int_alpha"),
        AlphaFusion: new Action("Alpha Fusion Reactor", "interstellar", "fusion", "int_alpha"),
        AlphaLaboratory: new Action("Alpha Laboratory", "interstellar", "laboratory", "int_alpha", {knowledge: true}),
        AlphaExchange: new Action("Alpha Exchange", "interstellar", "exchange", "int_alpha"),
        AlphaGraphenePlant: new Action("Alpha Graphene Plant", "interstellar", "g_factory", "int_alpha"),
        AlphaWarehouse: new Action("Alpha Warehouse", "interstellar", "warehouse", "int_alpha"),
        AlphaMegaFactory: new Action("Alpha Mega Factory", "interstellar", "int_factory", "int_alpha"),
        AlphaLuxuryCondo: new Action("Alpha Luxury Condo", "interstellar", "luxury_condo", "int_alpha", {housing: true}),
        AlphaExoticZoo: new Action("Alpha Exotic Zoo", "interstellar", "zoo", "int_alpha"),

        ProximaMission: new Action("Proxima Mission", "interstellar", "proxima_mission", "int_proxima"),
        ProximaTransferStation: new Action("Proxima Transfer Station", "interstellar", "xfer_station", "int_proxima"),
        ProximaCargoYard: new Action("Proxima Cargo Yard", "interstellar", "cargo_yard", "int_proxima"),
        ProximaCruiser: new Action("Proxima Patrol Cruiser", "interstellar", "cruiser", "int_proxima", {garrison: true}),
        ProximaDyson: new Action("Proxima Dyson Sphere (Adamantite)", "interstellar", "dyson", "int_proxima"),
        ProximaDysonSphere: new Action("Proxima Dyson Sphere (Bolognium)", "interstellar", "dyson_sphere", "int_proxima"),
        ProximaOrichalcumSphere: new Action("Proxima Dyson Sphere (Orichalcum)", "interstellar", "orichalcum_sphere", "int_proxima"),

        NebulaMission: new Action("Nebula Mission", "interstellar", "nebula_mission", "int_nebula"),
        NebulaNexus: new Action("Nebula Nexus", "interstellar", "nexus", "int_nebula"),
        NebulaHarvestor: new Action("Nebula Harvester", "interstellar", "harvester", "int_nebula"),
        NebulaEleriumProspector: new Action("Nebula Elerium Prospector", "interstellar", "elerium_prospector", "int_nebula"),

        NeutronMission: new Action("Neutron Mission", "interstellar", "neutron_mission", "int_neutron"),
        NeutronMiner: new Action("Neutron Miner", "interstellar", "neutron_miner", "int_neutron"),
        NeutronCitadel: new Action("Neutron Citadel Station", "interstellar", "citadel", "int_neutron"),
        NeutronStellarForge: new Action("Neutron Stellar Forge", "interstellar", "stellar_forge", "int_neutron"),

        Blackhole: new Action("Blackhole Mission", "interstellar", "blackhole_mission", "int_blackhole"),
        BlackholeFarReach: new Action("Blackhole Farpoint", "interstellar", "far_reach", "int_blackhole", {knowledge: true}),
        BlackholeStellarEngine: new Action("Blackhole Stellar Engine", "interstellar", "stellar_engine", "int_blackhole"),
        BlackholeMassEjector: new Action("Blackhole Mass Ejector", "interstellar", "mass_ejector", "int_blackhole"),

        BlackholeJumpShip: new Action("Blackhole Jump Ship", "interstellar", "jump_ship", "int_blackhole"),
        BlackholeWormholeMission: new Action("Blackhole Wormhole Mission", "interstellar", "wormhole_mission", "int_blackhole"),
        BlackholeStargate: new Action("Blackhole Stargate", "interstellar", "stargate", "int_blackhole"),
        BlackholeStargateComplete: new Action("Blackhole Stargate (Complete)", "interstellar", "s_gate", "int_blackhole"),

        SiriusMission: new Action("Sirius Mission", "interstellar", "sirius_mission", "int_sirius"),
        SiriusAnalysis: new Action("Sirius B Analysis", "interstellar", "sirius_b", "int_sirius"),
        SiriusSpaceElevator: new Action("Sirius Space Elevator", "interstellar", "space_elevator", "int_sirius"),
        SiriusGravityDome: new Action("Sirius Gravity Dome", "interstellar", "gravity_dome", "int_sirius"),
        SiriusAscensionMachine: new Action("Sirius Ascension Machine", "interstellar", "ascension_machine", "int_sirius"),
        SiriusAscensionTrigger: new Action("Sirius Ascension Machine (Complete)", "interstellar", "ascension_trigger", "int_sirius", {smart: true}),
        SiriusAscend: new Action("Sirius Ascend", "interstellar", "ascend", "int_sirius"),
        SiriusThermalCollector: new Action("Sirius Thermal Collector", "interstellar", "thermal_collector", "int_sirius"),

        GatewayMission: new Action("Gateway Mission", "galaxy", "gateway_mission", "gxy_gateway"),
        GatewayStarbase: new Action("Gateway Starbase", "galaxy", "starbase", "gxy_gateway", {garrison: true}),
        GatewayShipDock: new Action("Gateway Ship Dock", "galaxy", "ship_dock", "gxy_gateway"),

        BologniumShip: new Action("Gateway Bolognium Ship", "galaxy", "bolognium_ship", "gxy_gateway", {ship: true, smart: true}),
        ScoutShip: new Action("Gateway Scout Ship", "galaxy", "scout_ship", "gxy_gateway", {ship: true, smart: true}),
        CorvetteShip: new Action("Gateway Corvette Ship", "galaxy", "corvette_ship", "gxy_gateway", {ship: true, smart: true}),
        FrigateShip: new Action("Gateway Frigate Ship", "galaxy", "frigate_ship", "gxy_gateway", {ship: true}),
        CruiserShip: new Action("Gateway Cruiser Ship", "galaxy", "cruiser_ship", "gxy_gateway", {ship: true}),
        Dreadnought: new Action("Gateway Dreadnought", "galaxy", "dreadnought", "gxy_gateway", {ship: true}),

        StargateStation: new Action("Stargate Station", "galaxy", "gateway_station", "gxy_stargate"),
        StargateTelemetryBeacon: new Action("Stargate Telemetry Beacon", "galaxy", "telemetry_beacon", "gxy_stargate", {knowledge: true}),
        StargateDepot: new Action("Stargate Depot", "galaxy", "gateway_depot", "gxy_stargate", {smart: true}),
        StargateDefensePlatform: new Action("Stargate Defense Platform", "galaxy", "defense_platform", "gxy_stargate"),

        GorddonMission: new Action("Gorddon Mission", "galaxy", "gorddon_mission", "gxy_gorddon"),
        GorddonEmbassy: new Action("Gorddon Embassy", "galaxy", "embassy", "gxy_gorddon", {housing: true}),
        GorddonDormitory: new Action("Gorddon Dormitory", "galaxy", "dormitory", "gxy_gorddon", {housing: true}),
        GorddonSymposium: new Action("Gorddon Symposium", "galaxy", "symposium", "gxy_gorddon", {knowledge: true}),
        GorddonFreighter: new Action("Gorddon Freighter", "galaxy", "freighter", "gxy_gorddon", {ship: true}),

        Alien1Consulate: new Action("Alien 1 Consulate", "galaxy", "consulate", "gxy_alien1", {housing: true}),
        Alien1Resort: new Action("Alien 1 Resort", "galaxy", "resort", "gxy_alien1"),
        Alien1VitreloyPlant: new Action("Alien 1 Vitreloy Plant", "galaxy", "vitreloy_plant", "gxy_alien1", {smart: true}),
        Alien1SuperFreighter: new Action("Alien 1 Super Freighter", "galaxy", "super_freighter", "gxy_alien1", {ship: true}),

        Alien2Mission: new Action("Alien 2 Mission", "galaxy", "alien2_mission", "gxy_alien2"),
        Alien2Foothold: new Action("Alien 2 Foothold", "galaxy", "foothold", "gxy_alien2"),
        Alien2ArmedMiner: new Action("Alien 2 Armed Miner", "galaxy", "armed_miner", "gxy_alien2", {ship: true, smart: true}),
        Alien2OreProcessor: new Action("Alien 2 Ore Processor", "galaxy", "ore_processor", "gxy_alien2"),
        Alien2Scavenger: new Action("Alien 2 Scavenger", "galaxy", "scavenger", "gxy_alien2", {knowledge: true, ship: true}),

        ChthonianMission: new Action("Chthonian Mission", "galaxy", "chthonian_mission", "gxy_chthonian"),
        ChthonianMineLayer: new Action("Chthonian Mine Layer", "galaxy", "minelayer", "gxy_chthonian", {ship: true, smart: true}),
        ChthonianExcavator: new Action("Chthonian Excavator", "galaxy", "excavator", "gxy_chthonian", {smart: true}),
        ChthonianRaider: new Action("Chthonian Raider", "galaxy", "raider", "gxy_chthonian", {ship: true, smart: true}),

        PortalTurret: new Action("Portal Laser Turret", "portal", "turret", "prtl_fortress"),
        PortalCarport: new Action("Portal Surveyor Carport", "portal", "carport", "prtl_fortress"),
        PortalWarDroid: new Action("Portal War Droid", "portal", "war_droid", "prtl_fortress"),
        PortalRepairDroid: new Action("Portal Repair Droid", "portal", "repair_droid", "prtl_fortress"),

        BadlandsPredatorDrone: new Action("Badlands Predator Drone", "portal", "war_drone", "prtl_badlands"),
        BadlandsSensorDrone: new Action("Badlands Sensor Drone", "portal", "sensor_drone", "prtl_badlands"),
        BadlandsAttractor: new Action("Badlands Attractor Beacon", "portal", "attractor", "prtl_badlands", {smart: true}),

        PitMission: new Action("Pit Mission", "portal", "pit_mission", "prtl_pit"),
        PitAssaultForge: new Action("Pit Assault Forge", "portal", "assault_forge", "prtl_pit"),
        PitSoulForge: new Action("Pit Soul Forge", "portal", "soul_forge", "prtl_pit"),
        PitGunEmplacement: new Action("Pit Gun Emplacement", "portal", "gun_emplacement", "prtl_pit"),
        PitSoulAttractor: new Action("Pit Soul Attractor", "portal", "soul_attractor", "prtl_pit"),

        RuinsMission: new Action("Ruins Mission", "portal", "ruins_mission", "prtl_ruins"),
        RuinsGuardPost: new Action("Ruins Guard Post", "portal", "guard_post", "prtl_ruins", {smart: true}),
        RuinsVault: new Action("Ruins Vault", "portal", "vault", "prtl_ruins"),
        RuinsArchaeology: new Action("Ruins Archaeology", "portal", "archaeology", "prtl_ruins"),
        RuinsArcology: new Action("Ruins Arcology", "portal", "arcology", "prtl_ruins"),
        RuinsHellForge: new Action("Ruins Infernal Forge", "portal", "hell_forge", "prtl_ruins"),
        RuinsInfernoPower: new Action("Ruins Inferno Reactor", "portal", "inferno_power", "prtl_ruins"),
        RuinsAncientPillars: new Action("Ruins Ancient Pillars", "portal", "ancient_pillars", "prtl_ruins"),

        GateMission: new Action("Gate Mission", "portal", "gate_mission", "prtl_gate"),
        GateEastTower: new Action("Gate East Tower", "portal", "east_tower", "prtl_gate"),
        GateWestTower: new Action("Gate West Tower", "portal", "west_tower", "prtl_gate"),
        GateTurret: new Action("Gate Turret", "portal", "gate_turret", "prtl_gate"),
        GateInferniteMine: new Action("Gate Infernite Mine", "portal", "infernite_mine", "prtl_gate"),

        LakeMission: new Action("Lake Mission", "portal", "lake_mission", "prtl_lake"),
        LakeHarbour: new Action("Lake Harbour", "portal", "harbour", "prtl_lake", {smart: true}),
        LakeCoolingTower: new Action("Lake Cooling Tower", "portal", "cooling_tower", "prtl_lake", {smart: true}),
        LakeBireme: new Action("Lake Bireme Warship", "portal", "bireme", "prtl_lake", {smart: true}),
        LakeTransport: new Action("Lake Transport", "portal", "transport", "prtl_lake", {smart: true}),

        SpireMission: new Action("Spire Mission", "portal", "spire_mission", "prtl_spire"),
        SpirePurifier: new Action("Spire Purifier", "portal", "purifier", "prtl_spire"),
        SpirePort: new Action("Spire Port", "portal", "port", "prtl_spire", {smart: true}),
        SpireBaseCamp: new Action("Spire Base Camp", "portal", "base_camp", "prtl_spire", {smart: true}),
        SpireBridge: new Action("Spire Bridge", "portal", "bridge", "prtl_spire"),
        SpireSphinx: new Action("Spire Sphinx", "portal", "sphinx", "prtl_spire"),
        SpireBribeSphinx: new Action("Spire Bribe Sphinx", "portal", "bribe_sphinx", "prtl_spire"),
        SpireSurveyTower: new Action("Spire Survey Tower", "portal", "spire_survey", "prtl_spire"),
        SpireMechBay: new Action("Spire Mech Bay", "portal", "mechbay", "prtl_spire", {smart: true}),
        SpireTower: new Action("Spire Tower", "portal", "spire", "prtl_spire"),
        SpireWaygate: new Action("Portal Waygate", "portal", "waygate", "prtl_spire", {smart: true}),
    }

    var linkedBuildings = [
        [buildings.LakeTransport, buildings.LakeBireme],
        [buildings.SpirePort, buildings.SpireBaseCamp],
    ]

    var projects = {
        LaunchFacility: new Project("Launch Facility", "launch_facility"),
        SuperCollider: new Project("Supercollider", "lhc"),
        StockExchange: new Project("Stock Exchange", "stock_exchange"),
        Monument: new Project("Monument", "monument"),
        Railway: new Project("Railway", "railway"),
        Nexus: new Project("Nexus", "nexus"),
        RoidEject: new Project("Asteroid Redirect", "roid_eject"),
        ManaSyphon: new Project("Mana Syphon", "syphon"),
    }

    const wrGlobalCondition = 0; // Generic condition will be checked once per tick. Takes nothing and return bool - whether following rule is applicable, or not
    const wrIndividualCondition = 1; // Individual condition, checks every building, and return any value; if value casts to true - rule aplies
    const wrDescription = 2; // Description displayed in tooltip when rule applied, takes return value of individual condition, and building
    const wrMultiplier = 3; // Weighting mulptiplier. Called first without any context; rules returning x1 also won't be checked
    var weightingRules = [[
          () => !settings.autoBuild,
          () => true,
          () => "AutoBuild disabled",
          () => 0 // Set weighting to zero right away, and skip all checks if autoBuild is disabled
      ],[
          () => true,
          (building) => !building.isUnlocked(),
          () => "Locked",
          () => 0 // Should always be on top, processing locked building may lead to issues
      ],[
          () => true,
          (building) => state.queuedTargets.includes(building),
          () => "Queued building, processing...",
          () => 0
      ],[
          () => true,
          (building) => state.triggerTargets.includes(building),
          () => "Active trigger, processing...",
          () => 0
      ],[
          () => true,
          (building) => !building.autoBuildEnabled,
          () => "AutoBuild disabled",
          () => 0
      ],[
          () => true,
          (building) => building.count >= building.autoMax,
          () => "Maximum amount reached",
          () => 0
      ],[
          () => true,
          (building) => !building.isAffordable(true),
          () => "Not enough storage",
          () => 0 // Red buildings need to be filtered out, so they won't prevent affordable buildings with lower weight from building
      ],[
          () => game.global.race['truepath'] && buildings.SpaceTestLaunch.isUnlocked() && !haveTech('world_control'),
          (building) => {
              if (building === buildings.SpaceTestLaunch) {
                  let sabotage = 1;
                  for (let i = 0; i < 3; i++){
                      let gov = game.global.civic.foreign[`gov${i}`];
                      if (!gov.occ && !gov.anx && !gov.buy) {
                          sabotage++;
                      }
                  }
                  return 1 / (sabotage + 1);
              }
          },
          (chance) => `${Math.round(chance*100)}% chance of successful launch`,
          (chance) => chance < 0.5 ? chance : 0
      ],[
          () => settings.jobDisableMiners && buildings.GatewayStarbase.count > 0,
          (building) => building === buildings.Mine || building === buildings.CoalMine,
          () => "Miners disabled in Andromeda",
          () => 0
      ],[
          () => game.global.tech.piracy,
          (building) => building === buildings.StargateDefensePlatform && buildings.StargateDefensePlatform.count * 20 >= (game.global.race['instinct'] ? 0.09 : 0.1) * game.global.tech.piracy,
          () => "Piracy fully supressed",
          () => 0
      ],[
          () => settings.autoMech && settings.mechBuild !== "none" && settings.buildingMechsFirst && buildings.SpireMechBay.count > 0 && buildings.SpireMechBay.stateOffCount === 0,
          (building) => {
              if (resourceCost(building, resources.Supply) > 0) {
                  let mechBay = game.global.portal.mechbay;
                  let newSize = !haveTask("mech") ? settings.mechBuild === "random" ? MechManager.getPreferredSize() : mechBay.blueprint.size : "titan";
                  let [newGems, newSupply, newSpace] = MechManager.getMechCost({size: newSize});
                  if (newSpace <= mechBay.max - mechBay.bay && newSupply <= resources.Supply.maxQuantity && newGems <= resources.Soul_Gem.currentQuantity) {
                      return true;
                  }
              }
          },
          () => "Saving resources for new mech",
          () => 0
      ],[
          () => buildings.GateEastTower.isUnlocked() && buildings.GateWestTower.isUnlocked() && poly.hellSupression("gate").supress < settings.buildingTowerSuppression / 100,
          (building) => building === buildings.GateEastTower || building === buildings.GateWestTower,
          () => "Too low gate supression",
          () => 0
      ],[
          () => settings.prestigeWhiteholeSaveGems && settings.prestigeType === "whitehole",
          (building) => {
              let gemsCost = resourceCost(building, resources.Soul_Gem);
              if (gemsCost > 0 && resources.Soul_Gem.currentQuantity - gemsCost < 10) {
                  return true;
              }
          },
          () => "Saving up Soul Gems for prestige",
          () => 0
      ],[
          () => {
              return buildings.LakeBireme.isAutoBuildable() && buildings.LakeBireme.isAffordable(true) &&
                     buildings.LakeTransport.isAutoBuildable() && buildings.LakeTransport.isAffordable(true);
          },
          (building) => {
              if (building === buildings.LakeBireme || building === buildings.LakeTransport) {
                  let biremeCount = buildings.LakeBireme.count;
                  let transportCount = buildings.LakeTransport.count;
                  let rating = game.global.blood['spire'] && game.global.blood.spire >= 2 ? 0.8 : 0.85;
                  let nextBireme = (1 - (rating ** (biremeCount + 1))) * (transportCount * 5);
                  let nextTransport = (1 - (rating ** biremeCount)) * ((transportCount + 1) * 5);
                  if (building === buildings.LakeBireme && nextBireme < nextTransport) {
                      return buildings.LakeTransport;
                  }
                  if (building === buildings.LakeTransport && nextTransport < nextBireme) {
                      return buildings.LakeBireme;
                  }
              }
          },
          (other) => `${other.title} gives more Supplies`,
          () => 0 // Find what's better - Bireme or Transport
      ],[
          () => {
              return buildings.SpirePort.isAutoBuildable() && buildings.SpirePort.isAffordable(true) &&
                     buildings.SpireBaseCamp.isAutoBuildable() && buildings.SpireBaseCamp.isAffordable(true);
          },
          (building) => {
              if (building === buildings.SpirePort || building === buildings.SpireBaseCamp) {
                  let portCount = buildings.SpirePort.count;
                  let baseCount = buildings.SpireBaseCamp.count;
                  let nextPort = (portCount + 1) * (1 + baseCount * 0.4);
                  let nextBase = portCount * (1 + (baseCount + 1) * 0.4);
                  if (building === buildings.SpirePort && nextPort < nextBase) {
                      return buildings.SpireBaseCamp;
                  }
                  if (building === buildings.SpireBaseCamp && nextBase < nextPort) {
                      return buildings.SpirePort;
                  }
              }
          },
          (other) => `${other.title} gives more Max Supplies`,
          () => 0 // Find what's better - Port or Base
      ],[
          () => buildings.SpireWaygate.isUnlocked() && haveTech("waygate", 2),
          (building) => building === buildings.SpireWaygate,
          () => "Not available",
          () => 0 // We can't limit waygate using gameMax, as max here doesn't constant. It's start with 10, but after building count reduces down to 1
      ],[
          () => buildings.SpireSphinx.isUnlocked() && haveTech("hell_spire", 8),
          (building) => building === buildings.SpireSphinx,
          () => "Not available",
          () => 0 // Sphinx not usable after solving
      ],[
          () => buildings.RuinsAncientPillars.isUnlocked() && (game.global.tech.pillars !== 1 || game.global.race.universe === 'micro'),
          (building) => building === buildings.RuinsAncientPillars,
          () => "Not available",
          () => 0 // Pillars can't be activated in micro, and without tech.
      ],[
          () => buildings.GorddonEmbassy.count === 0 && resources.Knowledge.maxQuantity < settings.fleetEmbassyKnowledge,
          (building) => building === buildings.GorddonEmbassy,
          () => `${getNumberString(settings.fleetEmbassyKnowledge)} Max Knowledge required`,
          () => 0
      ],[
          () => game.global.race['magnificent'] && settings.buildingShrineType !== "any",
          (building) => {
              if (building === buildings.Shrine) {
                  let bonus = null;
                  if (game.global.city.calendar.moon > 0 && game.global.city.calendar.moon < 7){
                      bonus = "morale";
                  } else if (game.global.city.calendar.moon > 7 && game.global.city.calendar.moon < 14){
                      bonus = "metal";
                  } else if (game.global.city.calendar.moon > 14 && game.global.city.calendar.moon < 21){
                      bonus = "know";
                  } else if (game.global.city.calendar.moon > 21){
                      bonus = "tax";
                  } else {
                      return true;
                  }
                  if (settings.buildingShrineType === "equally") {
                      let minShrine = Math.min(game.global.city.shrine.morale, game.global.city.shrine.metal, game.global.city.shrine.know, game.global.city.shrine.tax);
                      return game.global.city.shrine[bonus] !== minShrine;
                  } else {
                      return settings.buildingShrineType !== bonus;
                  }
              }
          },
          () => "Wrong shrine",
          () => 0
      ],[
          () => game.global.race['slaver'],
          (building) => {
              if (building === buildings.SlaveMarket) {
                  if (resources.Slave.currentQuantity >= resources.Slave.maxQuantity) {
                      return "Slave pens already full";
                  }
                  if (resources.Money.currentQuantity + resources.Money.rateOfChange < resources.Money.maxQuantity && resources.Money.rateOfChange < 25000){
                      return "Buying slaves only with excess money";
                  }
              }
          },
          (note) => note,
          () => 0 // Slave Market
      ],[
          () => game.global.race['cannibalize'],
          (building) => {
              if (building === buildings.SacrificialAltar && building.count > 0) {
                  if (resources.Population.currentQuantity < 20) {
                      return "Too low population";
                  }
                  if (resources.Population.currentQuantity !== resources.Population.maxQuantity) {
                      return "Sacrifices performed only with full population";
                  }

                  if (game.global.civic[game.global.civic.d_job].workers < 1) {
                      return "No default workers to sacrifice";
                  }

                  if (game.global.city.s_alter.rage >= 3600 && game.global.city.s_alter.regen >= 3600 &&
                      game.global.city.s_alter.mind >= 3600 && game.global.city.s_alter.mine >= 3600 &&
                      (!isLumberRace() || game.global.city.s_alter.harvest >= 3600)){
                      return "Sacrifice bonus already high enough";
                  }
              }
          },
          (note) => note,
          () => 0 // Sacrificial Altar
      ],[
          () => true,
          (building) => building.getMissingConsumption(),
          (resource) => `Missing ${resource.name} to operate`,
          () => settings.buildingWeightingMissingSupply
      ],[
          () => true,
          (building) => building.getMissingSupport(),
          (support) => `Missing ${support.name} to operate`,
          () => settings.buildingWeightingMissingSupport
      ],[
          () => true,
          (building) => building.getUselessSupport(),
          (support) => `Provided ${support.name} not currently needed`,
          () => settings.buildingWeightingUselessSupport
      ],[
          () => true,
          (building) => building._tab === "city" && building !== buildings.Mill && building.stateOffCount > 0,
          () => "Still have some non operating buildings",
          () => settings.buildingWeightingNonOperatingCity
      ],[
          () => true,
          (building) => building._tab !== "city" && building.stateOffCount > 0
            && (building !== buildings.SpirePort || !buildings.SpirePort.isSmartManaged())
            && (building !== buildings.SpireBaseCamp || !buildings.SpireBaseCamp.isSmartManaged())
            && (building !== buildings.SpireMechBay || !buildings.SpireMechBay.isSmartManaged())
            && (building !== buildings.RuinsGuardPost || !buildings.RuinsGuardPost.isSmartManaged() || isHellSupressUseful())
            && (building !== buildings.BadlandsAttractor || !buildings.BadlandsAttractor.isSmartManaged()
            && (building !== buildings.StargateDepot || !buildings.StargateDepot.isSmartManaged())),
          () => "Still have some non operating buildings",
          () => settings.buildingWeightingNonOperating
      ],[
          () => settings.prestigeBioseedConstruct && settings.prestigeType !== "bioseed",
          (building) => building === buildings.GasSpaceDock || building === buildings.GasSpaceDockShipSegment || building === buildings.GasSpaceDockProbe,
          () => "Not needed for current prestige",
          () => 0
      ],[
          () => settings.prestigeBioseedConstruct && settings.prestigeType === "bioseed",
          (building) => building === buildings.DwarfWorldCollider,
          () => "Not needed for Bioseed prestige",
          () => 0
      ],[
          () => settings.prestigeBioseedConstruct && settings.prestigeType === "whitehole",
          (building) => building === buildings.BlackholeJumpShip,
          () => "Not needed for Whitehole prestige",
          () => 0
      ],[
          () => settings.prestigeBioseedConstruct && settings.prestigeType === "vacuum",
          (building) => building === buildings.BlackholeStellarEngine,
          () => "Not needed for Vacuum Collapse prestige",
          () => 0
      ],[
          () => settings.prestigeBioseedConstruct && settings.prestigeType === "ascension",
          (building) => building === buildings.GateMission || ((building === buildings.PitMission || building === buildings.RuinsMission) && isPillarFinished()),
          () => "Not needed for Ascension prestige",
          () => 0
      ],[
          () => settings.prestigeType === "mad" && (haveTech("mad") || (techIds['tech-mad'].isAffordable(true) && techIds['tech-mad'].resourceRequirements.every(req => req.resource.isUnlocked()))),
          (building) => !building.is.housing && !building.is.garrison && resourceCost(building, resources.Knowledge) <= 0 && (building !== buildings.OilWell || !game.global.race.terrifying), // Terrifying can't buy oil, keep building rigs
          () => "Awaiting MAD prestige",
          () => settings.buildingWeightingMADUseless
      ],[
          () => settings.buildPopulation,
          (building) => !building.is.housing && !building.is.garrison,
          () => "Building population",
          () => 0
      ],[
          () => true,
          (building) => building !== buildings.ForgeHorseshoe && building !== buildings.RedForgeHorseshoe && building.count === 0,
          () => "New building",
          () => settings.buildingWeightingNew
      ],[
          () => resources.Power.isUnlocked() && resources.Power.currentQuantity < resources.Power.maxQuantity,
          (building) => building === buildings.LakeCoolingTower || building.powered < 0,
          () => "Need more energy",
          () => settings.buildingWeightingNeedfulPowerPlant
      ],[
          () => resources.Power.isUnlocked() && resources.Power.currentQuantity > resources.Power.maxQuantity,
          (building) => building !== buildings.Mill && building.powered < 0,
          () => "No need for more energy",
          () => settings.buildingWeightingUselessPowerPlant
      ],[
          () => resources.Power.isUnlocked(),
          (building) => building !== buildings.LakeCoolingTower && building.powered > 0 && (building === buildings.NeutronCitadel ? getCitadelConsumption(building.count+1) - getCitadelConsumption(building.count) : building.powered) > resources.Power.currentQuantity,
          () => "Not enough energy",
          () => settings.buildingWeightingUnderpowered
      ],[
          () => state.knowledgeRequiredByTechs < resources.Knowledge.maxQuantity,
          (building) => building.is.knowledge && building !== buildings.Wardenclyffe, // We want Wardenclyffe for morale
          () => "No need for more knowledge",
          () => settings.buildingWeightingUselessKnowledge
      ],[
          () => state.knowledgeRequiredByTechs > resources.Knowledge.maxQuantity,
          (building) => building.is.knowledge,
          () => "Need more knowledge",
          () => settings.buildingWeightingNeedfulKnowledge
      ],[
          () => buildings.BlackholeMassEjector.count > 0 && buildings.BlackholeMassEjector.count * 1000 - game.global.interstellar.mass_ejector.total > 100,
          (building) => building === buildings.BlackholeMassEjector,
          () => "Still have some unused ejectors",
          () => settings.buildingWeightingUnusedEjectors
      ],[
          () => resources.Crates.maxQuantity > 0,
          (building) => building === buildings.StorageYard,
          () => "Still have some unused crates",
          () => settings.buildingWeightingCrateUseless
      ],[
          () => resources.Containers.maxQuantity > 0,
          (building) => building === buildings.Warehouse,
          () => "Still have some unused containers",
          () => settings.buildingWeightingCrateUseless
      ],[
          () => resources.Oil.maxQuantity < resources.Oil.requestedQuantity && buildings.OilWell.count <= 0 && buildings.GasMoonOilExtractor.count <= 0,
          (building) => building === buildings.OilWell || building === buildings.GasMoonOilExtractor,
          () => "Need more fuel",
          () => settings.buildingWeightingMissingFuel
      ],[
          () => resources.Helium_3.maxQuantity < resources.Helium_3.requestedQuantity || resources.Oil.maxQuantity < resources.Oil.requestedQuantity,
          (building) => building === buildings.OilDepot || building === buildings.SpacePropellantDepot || building === buildings.GasStorage,
          () => "Need more fuel",
          () => settings.buildingWeightingMissingFuel
      ],[
          () => game.global.race.hooved && resources.Horseshoe.spareQuantity >= resources.Horseshoe.storageRequired,
          (building) => building === buildings.ForgeHorseshoe || building === buildings.RedForgeHorseshoe,
          () => "No more Horseshoes needed",
          () => settings.buildingWeightingHorseshoeUseless
      ],[
          () => game.global.race.calm && resources.Zen.currentQuantity < resources.Zen.maxQuantity,
          (building) => building === buildings.MeditationChamber,
          () => "No more Meditation Space needed",
          () => settings.buildingWeightingZenUseless
      ],[
          () => buildings.GateTurret.isUnlocked() && poly.hellSupression("gate").rating >= 7500,
          (building) => building === buildings.GateTurret,
          () => "Gate demons fully supressed",
          () => settings.buildingWeightingGateTurret
      ],[
          () => resources.Containers.maxQuantity === 0 && resources.Crates.maxQuantity === 0,
          (building) => building === buildings.Shed || building === buildings.RedGarage || building === buildings.AlphaWarehouse || building === buildings.ProximaCargoYard,
          () => "Need more storage",
          () => settings.buildingWeightingNeedStorage
    ]];

    // Singleton manager objects
    var MinorTraitManager = {
        priorityList: [],
        _traitVueBinding: "geneticBreakdown",

        isUnlocked() {
            return haveTech("genetics", 3);
        },

        addMinorTraitToPriorityList(minorTrait) {
            minorTrait.priority = this.priorityList.length;
            this.priorityList.push(minorTrait);
        },

        sortByPriority() {
            this.priorityList.sort((a, b) => a.priority - b.priority);
        },

        managedPriorityList() {
            return this.priorityList.filter(trait => trait.enabled && trait.isUnlocked());
        },

        buyTrait(traitName) {
            getVueById(this._traitVueBinding)?.gene(traitName);
        }
    }

    var QuarryManager = {
        _industryVueBinding: "iQuarry",
        _industryVue: undefined,

        initIndustry() {
            if (buildings.RockQuarry.count < 1 || !game.global.race['smoldering']) {
                return false;
            }

            this._industryVue = getVueById(this._industryVueBinding);
            if (this._industryVue === undefined) {
                return false;
            }

            return true;
        },

        currentAsbestos() {
            return game.global.city.rock_quarry.asbestos;
        },

        increaseAsbestos(count) {
            if (count === 0) {
                return false;
            }
            if (count < 0) {
                return this.decreaseAsbestos(count * -1);
            }

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._industryVue.add();
            }
        },

        decreaseAsbestos(count) {
            if (count === 0) {
                return false;
            }
            if (count < 0) {
                return this.increaseAsbestos(count * -1);
            }

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._industryVue.sub();
            }
        }
    }

    var RitualManager = {
        _industryVueBinding: "iPylon",
        _industryVue: undefined,

        Productions: {
            Farmer: {id: 'farmer', isUnlocked: () => !game.global.race['carnivore'] && !game.global.race['soul_eater']},
            Miner: {id: 'miner', isUnlocked: () => true},
            Lumberjack: {id: 'lumberjack', isUnlocked: () => isLumberRace() && !game.global.race['evil']},
            Science: {id: 'science', isUnlocked: () => true},
            Factory: {id: 'factory', isUnlocked: () => jobs.CementWorker.count > 0},
            Army: {id: 'army', isUnlocked: () => true},
            Hunting: {id: 'hunting', isUnlocked: () => true},
            Crafting: {id: 'crafting', isUnlocked: () => haveTech("magic", 4)},
        },

        initIndustry() {
            if (buildings.Pylon.count < 1 || !game.global.race['casting']) {
                return false;
            }

            this._industryVue = getVueById(this._industryVueBinding);
            if (this._industryVue === undefined) {
                return false;
            }

            return true;
        },

        currentSpells(spell) {
            return game.global.race.casting[spell.id];
        },

        // export function manaCost(spell,rate) from industry.js
        manaCost(spell) {
            return spell * ((1.0025) ** spell - 1);
        },

        increaseRitual(spell, count) {
            if (count === 0 || !spell.isUnlocked()) {
                return false;
            }
            if (count < 0) {
                return this.decreaseRitual(spell, count * -1);
            }

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._industryVue.addSpell(spell.id);
            }
        },

        decreaseRitual(spell, count) {
            if (count === 0 || !spell.isUnlocked()) {
                return false;
            }
            if (count < 0) {
                return this.increaseRitual(count * -1);
            }

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._industryVue.subSpell(spell.id);
            }
        }
    }

    var SmelterManager = {
        _industryVueBinding: "iSmelter",
        _industryVue: undefined,

        Productions: normalizeProperties({
            Iron: {id: "Iron", unlocked: () => true, resource: resources.Iron, add: "ironSmelting", cost: []},
            Steel: {id: "Steel", unlocked: () => game.global.resource.Steel.display && haveTech("smelting", 2), resource: resources.Steel, add: "steelSmelting",
                    cost: [new ResourceProductionCost(resources.Coal, 0.25, 1.25), new ResourceProductionCost(resources.Iron, 2, 6)]},
        }, [ResourceProductionCost]),

        Fuels: normalizeProperties({
            Oil: {id: "Oil", unlocked: () => game.global.resource.Oil.display, cost: [new ResourceProductionCost(resources.Oil, 0.35, 2)]},
            Coal: {id: "Coal", unlocked: () => game.global.resource.Coal.display, cost: [new ResourceProductionCost(resources.Coal, () => !isLumberRace() ? 0.15 : 0.25, 2)]},
            Wood: {id: "Wood", unlocked: () => isLumberRace() || game.global.race['evil'], cost: [new ResourceProductionCost(() => game.global.race['evil'] ? game.global.race['soul_eater'] && game.global.race.species !== 'wendigo' ? resources.Food : resources.Furs : resources.Lumber, () => game.global.race['evil'] && !game.global.race['soul_eater'] || game.global.race.species === 'wendigo' ? 1 : 3, 6)]},
            Star: {id: "Star", unlocked: () => haveTech("star_forge", 2), cost: [new ResourceProductionCost(resources.StarPower, 1, 0)]},
            Inferno: {id: "Inferno", unlocked: () => haveTech("smelting", 8), cost: [new ResourceProductionCost(resources.Coal, 50, 50), new ResourceProductionCost(resources.Oil, 35, 50), new ResourceProductionCost(resources.Infernite, 0.5, 50)]},
        }, [ResourceProductionCost]),

        initIndustry() {
            if (buildings.Smelter.count < 1 && !game.global.race['cataclysm']) {
                return false;
            }

            this._industryVue = getVueById(this._industryVueBinding);
            if (this._industryVue === undefined) {
                return false;
            }

            return true;
        },

        managedFuelPriorityList() {
            return Object.values(this.Fuels).sort((a, b) => a.priority - b.priority);
        },

        fueledCount(fuel) {
            if (!fuel.unlocked) {
                return 0;
            }

            return game.global.city.smelter[fuel.id];
        },

        smeltingCount(production) {
            if (!production.unlocked) {
                return 0;
            }

            return game.global.city.smelter[production.id];
        },

        increaseFuel(fuel, count) {
            if (count === 0 || !fuel.unlocked) {
                return false;
            }
            if (count < 0) {
                return this.decreaseFuel(fuel, count * -1);
            }

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._industryVue.addFuel(fuel.id);
            }
        },

        decreaseFuel(fuel, count) {
            if (count === 0 || !fuel.unlocked) {
                return false;
            }
            if (count < 0) {
                return this.increaseFuel(fuel, count * -1);
            }

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._industryVue.subFuel(fuel.id);
            }
        },

        increaseSmelting(production, count) {
            if (count === 0 || !production.unlocked) {
                return false;
            }

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._industryVue[production.add]();
            }
        },

        maxOperating() {
            return game.global.city.smelter.cap;
        }
    }

    var FactoryManager = {
        _industryVueBinding: "iFactory",
        _industryVue: undefined,

        Productions: normalizeProperties({
            LuxuryGoods:          {id: "Lux", resource: resources.Money, unlocked: () => true,
                                   cost: [new ResourceProductionCost(resources.Furs, () => FactoryManager.f_rate("Lux", "fur"), 5)]},
            Furs:                 {id: "Furs", resource: resources.Furs, unlocked: () => haveTech("synthetic_fur"),
                                   cost: [new ResourceProductionCost(resources.Money, () => FactoryManager.f_rate("Furs", "money"), 1000),
                                          new ResourceProductionCost(resources.Polymer, () => FactoryManager.f_rate("Furs", "polymer"), 10)]},
            Alloy:                {id: "Alloy", resource: resources.Alloy, unlocked: () => true,
                                   cost: [new ResourceProductionCost(resources.Copper, () => FactoryManager.f_rate("Alloy", "copper"), 5),
                                          new ResourceProductionCost(resources.Aluminium, () => FactoryManager.f_rate("Alloy", "aluminium"), 5)]},
            Polymer:              {id: "Polymer", resource: resources.Polymer, unlocked: () => haveTech("polymer"),
                                   cost: function(){ return !isLumberRace() ? this.cost_kk : this.cost_normal},
                                   cost_kk:       [new ResourceProductionCost(resources.Oil, () => FactoryManager.f_rate("Polymer", "oil_kk"), 2)],
                                   cost_normal:   [new ResourceProductionCost(resources.Oil, () => FactoryManager.f_rate("Polymer", "oil"), 2),
                                                   new ResourceProductionCost(resources.Lumber, () => FactoryManager.f_rate("Polymer", "lumber"), 50)]},
            NanoTube:             {id: "Nano", resource: resources.Nano_Tube, unlocked: () => haveTech("nano"),
                                   cost: [new ResourceProductionCost(resources.Coal, () => FactoryManager.f_rate("Nano_Tube", "coal"), 15),
                                          new ResourceProductionCost(resources.Neutronium, () => FactoryManager.f_rate("Nano_Tube", "neutronium"), 0.2)]},
            Stanene:              {id: "Stanene", resource: resources.Stanene, unlocked: () => haveTech("stanene"),
                                   cost: [new ResourceProductionCost(resources.Aluminium, () => FactoryManager.f_rate("Stanene", "aluminium"), 50),
                                          new ResourceProductionCost(resources.Nano_Tube, () => FactoryManager.f_rate("Stanene", "nano"), 5)]},
        }, [ResourceProductionCost]),

        initIndustry() {
            if (buildings.Factory.count < 1 && buildings.RedFactory.count < 1) {
                return false;
            }

            this._industryVue = getVueById(this._industryVueBinding);
            if (this._industryVue === undefined) {
                return false;
            }
            return true;
        },

        f_rate(production, resource) {
            return game.f_rate[production][resource][game.global.tech['factory'] || 0];
        },

        currentOperating() {
            let total = 0;
            for (let key in this.Productions){
                let production = this.Productions[key];
                total += game.global.city.factory[production.id];
            }
            return total;
        },

        maxOperating() {
            let max = buildings.Factory.stateOnCount + buildings.RedFactory.stateOnCount + buildings.AlphaMegaFactory.stateOnCount * 2;
            for (let key in this.Productions){
                let production = this.Productions[key];
                if (production.unlocked && !production.enabled) {
                    max -= game.global.city.factory[production.id];
                }
            }
            return max;
        },

        currentProduction(production) {
            return production.unlocked ? game.global.city.factory[production.id] : 0;
        },

        increaseProduction(production, count) {
            if (count === 0 || !production.unlocked) {
                return false;
            }
            if (count < 0) {
                return this.decreaseProduction(production, count * -1);
            }

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._industryVue.addItem(production.id);
            }
        },

        decreaseProduction(production, count) {
            if (count === 0 || !production.unlocked) {
                return false;
            }
            if (count < 0) {
                return this.increaseProduction(production, count * -1);
            }

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._industryVue.subItem(production.id);
            }
        }
    }

    var DroidManager = {
        _industryVueBinding: "iDroid",
        _industryVue: undefined,

        Productions: {
            Adamantite: {id: "adam", resource: resources.Adamantite},
            Uranium: {id: "uran", resource: resources.Uranium},
            Coal: {id: "coal", resource: resources.Coal},
            Aluminium: {id: "alum", resource: resources.Aluminium},
        },

        initIndustry() {
            if (buildings.AlphaMiningDroid.count < 1) {
                return false;
            }

            this._industryVue = getVueById(this._industryVueBinding);
            if (this._industryVue === undefined) {
                return false;
            }

            return true;
        },

        currentOperating() {
            let total = 0;
            for (let key in this.Productions){
                let production = this.Productions[key];
                total += game.global.interstellar.mining_droid[production.id];
            }
            return total;
        },

        maxOperating() {
            return game.global.interstellar.mining_droid.on;
        },

        currentProduction(production) {
            return game.global.interstellar.mining_droid[production.id];
        },

        increaseProduction(production, count) {
            if (count === 0) {
                return false;
            }
            if (count < 0) {
                return this.decreaseProduction(production, count * -1);
            }

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._industryVue.addItem(production.id);
            }
        },

        decreaseProduction(production, count) {
            if (count === 0) {
                return false;
            }
            if (count < 0) {
                return this.increaseProduction(production, count * -1);
            }

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._industryVue.subItem(production.id);
            }
        }
    }

    var GrapheneManager = {
        _industryVueBinding: "iGraphene",
        _industryVue: undefined,

        Fuels: {
            Lumber: {id: "Lumber", cost: new ResourceProductionCost(resources.Lumber, 350, 100), add: "addWood", sub: "subWood"},
            Coal: {id: "Coal", cost: new ResourceProductionCost(resources.Coal, 25, 10), add: "addCoal", sub: "subCoal"},
            Oil: {id: "Oil", cost: new ResourceProductionCost(resources.Oil, 15, 10), add: "addOil", sub: "subOil"},
        },

        initIndustry() {
            if (buildings.AlphaGraphenePlant.count < 1) {
                return false;
            }

            this._industryVue = getVueById(this._industryVueBinding);
            if (this._industryVue === undefined) {
                return false;
            }

            return true;
        },

        maxOperating() {
            return game.global.interstellar.g_factory.on;
        },

        fueledCount(fuel) {
            return game.global.interstellar.g_factory[fuel.id];
        },

        increaseFuel(fuel, count) {
            if (count === 0 || !fuel.cost.resource.isUnlocked()) {
                return false;
            }
            if (count < 0) {
                return this.decreaseFuel(fuel, count * -1);
            }

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._industryVue[fuel.add]();
            }
        },

        decreaseFuel(fuel, count) {
            if (count === 0 || !fuel.cost.resource.isUnlocked()) {
                return false;
            }
            if (count < 0) {
                return this.increaseFuel(fuel, count * -1);
            }

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._industryVue[fuel.sub]();
            }
        }
    }

    var GalaxyTradeManager = {
        _industryVueBinding: "galaxyTrade",
        _industryVue: undefined,

        initIndustry() {
            if (buildings.GorddonFreighter.count + buildings.Alien1SuperFreighter.count < 1) {
                return false;
            }

            this._industryVue = getVueById(this._industryVueBinding);
            if (this._industryVue === undefined) {
                return false;
            }

            return true;
        },

        currentOperating() {
            return game.global.galaxy.trade.cur;
        },

        maxOperating() {
            return game.global.galaxy.trade.max;
        },

        currentProduction(production) {
            return game.global.galaxy.trade["f" + production];
        },

        zeroProduction(production) {
            this._industryVue.zero(production);
        },

        increaseProduction(production, count) {
            if (count === 0) {
                return false;
            }
            if (count < 0) {
                return this.decreaseProduction(production, count * -1);
            }

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._industryVue.more(production);
            }
        },

        decreaseProduction(production, count) {
            if (count === 0) {
                return false;
            }
            if (count < 0) {
                return this.increaseProduction(production, count * -1);
            }

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._industryVue.less(production);
            }
        }
    }

    var GovernmentManager = {
        Types: {
            anarchy: {id: "anarchy", isUnlocked: () => false}, // Special - should not be shown to player
            autocracy: {id: "autocracy", isUnlocked: () => true},
            democracy: {id: "democracy", isUnlocked: () => true},
            oligarchy: {id: "oligarchy", isUnlocked: () => true},
            theocracy: {id: "theocracy", isUnlocked: () => haveTech("gov_theo")},
            republic: {id: "republic", isUnlocked: () => haveTech("govern", 2)},
            socialist: {id: "socialist", isUnlocked: () => haveTech("gov_soc")},
            corpocracy: {id: "corpocracy", isUnlocked: () => haveTech("gov_corp")},
            technocracy: {id: "technocracy", isUnlocked: () => haveTech("govern", 3)},
            federation: {id: "federation", isUnlocked: () => haveTech("gov_fed")},
            magocracy: {id: "magocracy", isUnlocked: () => haveTech("gov_mage")},
        },

        isUnlocked() {
            let node = document.getElementById("govType");
            return node !== null && node.style.display !== "none";
        },

        isEnabled() {
            let node = document.querySelector("#govType button");
            return this.isUnlocked() && node !== null && node.getAttribute("disabled") !== "disabled";
        },

        currentGovernment() {
            return game.global.civic.govern.type;
        },

        setGovernment(government) {
            // Don't try anything if chosen government already set, or modal window is already open
            if (this.currentGovernment() === government || WindowManager.isOpen()) {
                return;
            }

            let optionsNode = document.querySelector("#govType button");
            let title = game.loc('civics_government_type');
            WindowManager.openModalWindowWithCallback(optionsNode, title, () => {
                GameLog.logSuccess(GameLog.Types.special, `Revolution! Government changed to ${game.loc("govern_" + government)}.`);
                getVueById('govModal')?.setGov(government);
            });
        },
    }

    var MarketManager = {
        priorityList: [],
        multiplier: 0,

        updateData() {
            if (game.global.city.market) {
                this.multiplier = game.global.city.market.qty;
            }
        },

        isUnlocked() {
            return haveTech("currency", 2);
        },

        sortByPriority() {
            this.priorityList.sort((a, b) => a.marketPriority - b.marketPriority);
        },

        isBuySellUnlocked(resource) {
            return document.querySelector("#market-" + resource.id + " .order") !== null;
        },

        setMultiplier(multiplier) {
            this.multiplier = Math.min(Math.max(1, multiplier), this.getMaxMultiplier());

            getVueById("market-qty").qty = this.multiplier;
        },

        getMaxMultiplier(){
            return getVueById("market-qty")?.limit() ?? 1;
        },

        getUnitBuyPrice(resource) {
            // marketItem > vBind > purchase from resources.js
            let price = game.global.resource[resource.id].value;
            if (game.global.race['arrogant']){
                price *= 1.1;
            }
            if (game.global.race['conniving']){
                price *= 0.95;
            }
            return price;
        },

        getUnitSellPrice(resource) {
            // marketItem > vBind > sell from resources.js
            let divide = 4;
            if (game.global.race['merchant']){
                divide *= 0.75;
            }
            if (game.global.race['asymmetrical']){
                divide *= 1.2;
            }
            if (game.global.race['conniving']){
                divide *= 0.95;
            }
            return game.global.resource[resource.id].value / divide;
        },

        buy(resource) {
            let vue = getVueById(resource._marketVueBinding);
            if (vue === undefined) { return false; }

            let price = this.getUnitBuyPrice(resource) * this.multiplier;
            if (resources.Money.currentQuantity < price) { return false; }

            resources.Money.currentQuantity -= this.multiplier * this.getUnitSellPrice(resource);
            resource.currentQuantity += this.multiplier;

            vue.purchase(resource.id);
        },

        sell(resource) {
            let vue = getVueById(resource._marketVueBinding);
            if (vue === undefined) { return false; }

            if (resource.currentQuantity < this.multiplier) { return false; }

            resources.Money.currentQuantity += this.multiplier * this.getUnitSellPrice(resource);
            resource.currentQuantity -= this.multiplier;

            vue.sell(resource.id);
        },

        getImportRouteCap() {
            if (haveTech("currency", 6)){
                return 1000000;
            } else if (haveTech("currency", 4)){
                return 100;
            } else {
                return 25;
            }
        },

        getExportRouteCap() {
            if (!game.global.race['banana']){
                return this.getImportRouteCap();
            } else if (haveTech("currency", 6)){
                return 1000000;
            } else if (haveTech("currency", 4)){
                return 25;
            } else {
                return 10;
            }
        },

        getMaxTradeRoutes() {
            let max = game.global.city.market.mtrade;
            let unmanaged = 0;
            for (let i = 0; i < this.priorityList.length; i++) {
                let resource = this.priorityList[i];
                if (!resource.autoTradeBuyEnabled && !resource.autoTradeSellEnabled) {
                    max -= Math.abs(resource.tradeRoutes);
                    unmanaged += resource.tradeRoutes;
                }
            }
            return [max, unmanaged];
        },

        zeroTradeRoutes(resource) {
            getVueById(resource._marketVueBinding)?.zero(resource.id);
        },

        addTradeRoutes(resource, count) {
            if (!resource.isUnlocked()) { return false; }

            let vue = getVueById(resource._marketVueBinding);
            if (vue === undefined) { return false; }

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                vue.autoBuy(resource.id);
            }
        },

        removeTradeRoutes(resource, count) {
            if (!resource.isUnlocked()) { return false; }

            let vue = getVueById(resource._marketVueBinding);
            if (vue === undefined) { return false; }

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                vue.autoSell(resource.id);
            }
        }
    }

    var StorageManager = {
        priorityList: [],
        _storageVueBinding: "createHead",
        _storageVue: undefined,

        initStorage() {
            if (!this.isUnlocked) {
                return false;
            }

            this._storageVue = getVueById(this._storageVueBinding);
            if (this._storageVue === undefined) {
                return false;
            }

            return true;
        },

        isUnlocked() {
            return haveTech("container");
        },

        sortByPriority() {
            this.priorityList.sort((a, b) => a.storagePriority - b.storagePriority);
        },

        constructCrate(count) {
            if (count <= 0) {
                return;
            }
            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._storageVue.crate();
            }
        },

        constructContainer(count) {
            if (count <= 0) {
                return;
            }
            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._storageVue.container();
            }
        },

        assignCrate(resource, count) {
            let vue = getVueById(resource._stackVueBinding);
            if (vue === undefined) { return false; }

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                vue.addCrate(resource.id);
            }
        },

        unassignCrate(resource, count) {
            let vue = getVueById(resource._stackVueBinding);
            if (vue === undefined) { return false; }

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                vue.subCrate(resource.id);
            }
        },

        assignContainer(resource, count) {
            let vue = getVueById(resource._stackVueBinding);
            if (vue === undefined) { return false; }

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                vue.addCon(resource.id);
            }
        },

        unassignContainer(resource, count) {
            let vue = getVueById(resource._stackVueBinding);
            if (vue === undefined) { return false; }

            resetMultiplier();
            for (let i = 0; i < count; i++) {
                vue.subCon(resource.id);
            }
        }
    }

    var SpyManager = {
        Types: {
            Influence: {id: "influence", rival: true},
            Sabotage: {id: "sabotage", rival: true},
            Incite: {id: "incite", rival: false},
            Annex: {id: "annex", rival: false},
            Purchase: {id: "purchase", rival: false},
        },

        performEspionage(govIndex, espionageId, influenceAllowed) {
            if (WindowManager.isOpen()) { return; } // Don't try anything if a window is already open

            let optionsSpan = document.querySelector(`#gov${govIndex} div span:nth-child(3)`);
            if (optionsSpan.style.display === "none") { return; }

            let optionsNode = document.querySelector(`#gov${govIndex} div span:nth-child(3) button`);
            if (optionsNode === null || optionsNode.getAttribute("disabled") === "disabled") { return; }

            let espionageToPerform = null;
            if (espionageId === this.Types.Annex.id || espionageId === this.Types.Purchase.id) {
                // Occupation routine
                if (this.isEspionageUseful(govIndex, espionageId)) {
                    // If we can annex\purchase right now - do it
                    espionageToPerform = espionageId;
                } else if (this.isEspionageUseful(govIndex, this.Types.Influence.id) && influenceAllowed) {
                    // Influence goes second, as it always have clear indication when HSTL already at zero
                    espionageToPerform = this.Types.Influence.id;
                } else if (this.isEspionageUseful(govIndex, this.Types.Incite.id)) {
                    // And now incite
                    espionageToPerform = this.Types.Incite.id;
                }
            } else if (this.isEspionageUseful(govIndex, espionageId)) {
                // User specified spy operation. If it is not already at miximum effect then proceed with it.
                espionageToPerform = espionageId;
            }

            if (espionageToPerform !== null) {
                if (espionageToPerform === this.Types.Purchase.id) {
                    resources.Money.currentQuantity -= poly.govPrice("gov" + govIndex);
                }
                let title = game.loc('civics_espionage_actions');
                WindowManager.openModalWindowWithCallback(optionsNode, title, () => {
                    GameLog.logSuccess(GameLog.Types.spying, `Performing "${game.loc("civics_spy_" + espionageToPerform)}" covert operation against ${getGovName(govIndex)}.`);
                    getVueById('espModal')?.[espionageToPerform]?.(govIndex);
                });
            }
        },

        isEspionageUseful(govIndex, espionageId) {
            let gov = game.global.civic.foreign["gov" + govIndex];

            // Return true when requested task is useful, or when we don't have enough spies prove it's not
            switch (espionageId) {
                case this.Types.Influence.id:
                    return gov.hstl > (gov.spy > 0 ? 0 : 10);
                case this.Types.Sabotage.id:
                    return gov.spy < 1 || gov.mil > (gov.spy > 1 ? 50 : 74);
                case this.Types.Incite.id:
                    return gov.spy < 3 || gov.unrest < (gov.spy > 3 ? 100 : 76);
                case this.Types.Annex.id:
                    return gov.hstl <= 50 && gov.unrest >= 50 && game.global.city.morale.current >= (200 + gov.hstl - gov.unrest);
                case this.Types.Purchase.id:
                    return gov.spy >= 3 && resources.Money.currentQuantity >= poly.govPrice("gov" + govIndex);
            }
            return false;
        },
    }

    var WarManager = {
        _garrisonVueBinding: "garrison",
        _garrisonVue: undefined,
        _hellVueBinding:"fort",
        _hellVue: undefined,
        workers: 0,
        wounded: 0,
        max: 0,
        raid: 0,
        m_use: 0,
        crew: 0,
        hellAttractorMax: 0,
        hellSoldiers: 0,
        hellPatrols: 0,
        hellPatrolSize: 0,
        hellAssigned: 0,
        hellReservedSoldiers: 0,

        initGarrison() {
            if (!game.global.civic.garrison) {
                return false;
            }

            this._garrisonVue = getVueById(this._garrisonVueBinding);
            if (this._garrisonVue === undefined) {
                return false;
            }

            return true;
        },

        initHell() {
            if (!game.global.portal.fortress) {
                return false;
            }

            this._hellVue = getVueById(this._hellVueBinding);
            if (this._hellVue === undefined) {
                return false;
            }

            return true;
        },

        updateData() {
            if (game.global.civic.garrison) {
                this.workers = game.global.civic.garrison.workers;
                this.wounded = game.global.civic.garrison.wounded;
                this.raid = game.global.civic.garrison.raid;
                this.max = game.global.civic.garrison.max;
                this.m_use = game.global.civic.garrison.m_use;
                this.crew = game.global.civic.garrison.crew;
            }

            if (game.global.portal.fortress) {
                this.hellSoldiers = game.global.portal.fortress.garrison;
                this.hellPatrols = game.global.portal.fortress.patrols;
                this.hellPatrolSize = game.global.portal.fortress.patrol_size;
                this.hellAssigned = game.global.portal.fortress.assigned;
                this.hellReservedSoldiers = this.getHellReservedSoldiers();
            }
        },

        isForeignUnlocked() {
            return getVueById('foreign')?.vis() ?? false;
        },

        get currentSoldiers() {
            return this.workers - this.crew;
        },

        get maxSoldiers() {
            return this.max - this.crew;
        },

        get currentCityGarrison() {
            return this.currentSoldiers - this.hellSoldiers;
        },

        get maxCityGarrison() {
            return this.maxSoldiers - this.hellSoldiers;
        },

        get availableGarrison() {
            return game.global.race['rage'] ? Math.min(this.maxCityGarrison, this.currentSoldiers - this.wounded) : this.currentCityGarrison - this.wounded;
        },

        get hellGarrison()  {
            return this.hellSoldiers - this.hellPatrolSize * this.hellPatrols - this.hellReservedSoldiers;
        },

        launchCampaign(govIndex) {
            this._garrisonVue.campaign(govIndex);
        },

        release(govIndex) {
            if (game.global.civic.foreign["gov" + govIndex].occ) {
                let occSoldiers = getOccCosts();
                this.workers += occSoldiers;
                this.max += occSoldiers;
            }
            this._garrisonVue.campaign(govIndex);
        },

        isMercenaryUnlocked() {
            return game.global.civic.garrison.mercs;
        },

        // function mercCost from civics.js
        getMercenaryCost() {
            let cost = Math.round((1.24 ** this.workers) * 75) - 50;
            if (cost > 25000){
                cost = 25000;
            }
            if (this.m_use > 0){
                cost *= 1.1 ** this.m_use;
            }
            if (game.global.race['brute']){
                cost *= 0.5;
            }
            return Math.round(cost);
        },

        hireMercenary() {
            let cost = this.getMercenaryCost();
            if (this.workers >= this.max || resources.Money.currentQuantity < cost){
                return false;
            }

            resetMultiplier();
            this._garrisonVue.hire();

            resources.Money.currentQuantity -= cost;
            this.workers++;
            this.m_use++;

            return true;
        },

        getHellReservedSoldiers(){
            let soldiers = 0;
            if (buildings.PitSoulForge.count > 0 || buildings.PitAssaultForge.isAutoBuildable()) {
                // export function soulForgeSoldiers() from portal.js
                soldiers = Math.round(650 / game.armyRating(1, "hellArmy"));
                if (game.global.portal.gun_emplacement) {
                    soldiers -= game.global.portal.gun_emplacement.on * (game.global.tech.hell_gun >= 2 ? 2 : 1);
                    if (soldiers < 0){
                        soldiers = 0;
                    }
                }
            }

            // Guardposts need at least one soldier free so lets just always keep one handy
            if (buildings.RuinsGuardPost.count > 0) {
                soldiers += buildings.RuinsGuardPost.stateOnCount + 1;
            }
            return soldiers;
        },

        setTactic(newTactic){
            let currentTactic = game.global.civic.garrison.tactic;
            for (let i = currentTactic; i < newTactic; i++) {
                this._garrisonVue.next();
            }
            for (let i = currentTactic; i > newTactic; i--) {
                this._garrisonVue.last();
            }
        },

        getCampaignTitle(tactic) {
            return this._garrisonVue.$options.filters.tactics(tactic);
        },

        addBattalion(count) {
            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._garrisonVue.aNext();
            }

            this.raid = Math.min(this.raid + count, this.currentCityGarrison);
        },

        removeBattalion(count) {
            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._garrisonVue.aLast();
            }

            this.raid = Math.max(this.raid - count, 0);
        },

        getGovArmy(tactic, govIndex) { // function battleAssessment(gov)
            let enemy = [5, 27.5, 62.5, 125, 300][tactic];
            if (game.global.race['banana']) {
                enemy *= 2;
            }
            return enemy * getGovPower(govIndex) / 100;
        },

        getAdvantage(army, tactic, govIndex) {
            return (1 - (this.getGovArmy(tactic, govIndex) / army)) * 100;
        },

        getRatingForAdvantage(adv, tactic, govIndex) {
            return this.getGovArmy(tactic, govIndex) / (1 - (adv/100));
        },

        getSoldiersForAdvantage(advantage, tactic, govIndex) {
            return this.getSoldiersForAttackRating(this.getRatingForAdvantage(advantage, tactic, govIndex));
        },

        // Calculates the required soldiers to reach the given attack rating, assuming everyone is healthy.
        getSoldiersForAttackRating(targetRating) {
            if (!targetRating || targetRating <= 0) {
                return 0;
            }
            // Getting the rating for 100 soldiers and dividing it by number of soldiers, to get more accurate value after rounding
            // If requested number is bigger than amount of healthy soldiers, returned value will be spoiled
            // To avoid that we're explicitly passing zero number of wounded soldiers as string(!)
            // "0" casts to true boolean, and overrides real amount of wounded soldiers, yet still acts as 0 in math
            // TODO: Fixed in 1.2, change "0" to 0
            let singleSoldierAttackRating = game.armyRating(10, "army", "0") / 10;
            let maxSoldiers = Math.ceil(targetRating / singleSoldierAttackRating);
            if (!game.global.race['hivemind']) {
                return maxSoldiers;
            }

            // Ok, we've done no hivemind. Hivemind is trickier because each soldier gives attack rating and a bonus to all other soldiers.
            // I'm sure there is an exact mathematical calculation for this but...
            // Just loop through and remove 1 at a time until we're under the max rating.

            // At 10 soldiers there's no hivemind bonus or malus, and the malus gets up to 50%, so start with up to 2x soldiers below 10
            if (maxSoldiers < 10) {
                maxSoldiers = Math.min(10, maxSoldiers * 2);
            }

            // TODO: Fixed in 1.2, change "0" to 0
            while (maxSoldiers > 1 && game.armyRating(maxSoldiers - 1, "army", "0") > targetRating) {
                maxSoldiers--;
            }

            return maxSoldiers;
        },

        addHellGarrison(count) {
            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._hellVue.aNext();
            }

            this.hellSoldiers = Math.min(this.hellSoldiers + count, this.workers);
            this.hellAssigned = this.hellSoldiers;
        },

        removeHellGarrison(count) {
            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._hellVue.aLast();
            }

            let min = this.hellPatrols * this.hellPatrolSize + this.hellReservedSoldiers;
            this.hellSoldiers = Math.max(this.hellSoldiers - count, min);
            this.hellAssigned = this.hellSoldiers;
        },

        addHellPatrol(count) {
            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._hellVue.patInc();
            }

            if (this.hellPatrols * this.hellPatrolSize < this.hellSoldiers){
                this.hellPatrols += count;
                if (this.hellSoldiers < this.hellPatrols * this.hellPatrolSize){
                    this.hellPatrols = Math.floor(this.hellSoldiers / this.hellPatrolSize);
                }
            }
        },

        removeHellPatrol(count) {
            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._hellVue.patDec();
            }

            this.hellPatrols = Math.max(this.hellPatrols - count, 0);
        },

        addHellPatrolSize(count) {
            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._hellVue.patSizeInc();
            }

            if (this.hellPatrolSize < this.hellSoldiers){
                this.hellPatrolSize += count;
                if (this.hellSoldiers < this.hellPatrols * this.hellPatrolSize){
                    this.hellPatrols = Math.floor(this.hellSoldiers / this.hellPatrolSize);
                }
            }
        },

        removeHellPatrolSize(count) {
            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._hellVue.patSizeDec();
            }

            this.hellPatrolSize = Math.max(this.hellPatrolSize - count, 1);
        }
    }

    var MechManager = {
        _assemblyVueBinding: "mechAssembly",
        _assemblyVue: undefined,
        _listVueBinding: "mechList",
        _listVue: undefined,

        collectorValue: 20000, // Collectors power mod. Higher number - more often they'll be scrapped. Current value derieved from scout: collectorValue = collectorPower / (scoutPower / scoutSize), to equalize relative values of collectors and combat mechs with same efficiency.

        activeMechs: [],
        inactiveMechs: [],
        mechsPower: 0,
        mechsPotential: 0,
        isActive: false,

        lastLevel: -1,
        lastPrepared: -1,
        lastWrath: -1,
        lastScouts: -1,
        lastSpecial: "",
        bestSize: [],
        bestMech: {},
        bestBody: {},
        bestWeapon: [],

        Size: ['small','medium','large','titan','collector'],
        Chassis: ['wheel','tread','biped','quad','spider','hover'],
        Weapon: ['laser','kinetic','shotgun','missile','flame','plasma','sonic','tesla'],
        Equip: ['special','shields','sonar','grapple','infrared','flare','radiator','coolant','ablative','stabilizer','seals'],

        SizeSlots: {small: 0, medium: 1, large: 2, titan: 4, collector: 2},
        SizeWeapons: {small: 1, medium: 1, large: 2, titan: 4, collector: 0},
        SmallChassisMod: {
            wheel:  { sand: 0.9,  swamp: 0.35, forest: 1,    jungle: 0.92, rocky: 0.65, gravel: 1,    muddy: 0.85, grass: 1.3,  brush: 0.9,  concrete: 1.1},
            tread:  { sand: 1.15, swamp: 0.55, forest: 1,    jungle: 0.95, rocky: 0.65, gravel: 1.3,  muddy: 0.88, grass: 1,    brush: 1,    concrete: 1},
            biped:  { sand: 0.78, swamp: 0.68, forest: 1,    jungle: 0.82, rocky: 0.48, gravel: 1,    muddy: 0.85, grass: 1.25, brush: 0.92, concrete: 1},
            quad:   { sand: 0.86, swamp: 0.58, forest: 1.25, jungle: 1,    rocky: 0.95, gravel: 0.9,  muddy: 0.68, grass: 1,    brush: 0.95, concrete: 1},
            spider: { sand: 0.75, swamp: 0.9,  forest: 0.82, jungle: 0.77, rocky: 1.25, gravel: 0.86, muddy: 0.92, grass: 1,    brush: 1,    concrete: 1},
            hover:  { sand: 1,    swamp: 1.35, forest: 0.65, jungle: 0.55, rocky: 0.82, gravel: 1,    muddy: 1.15, grass: 1,    brush: 0.78, concrete: 1}
        },
        LargeChassisMod: {
            wheel:  { sand: 0.85, swamp: 0.18, forest: 1,    jungle: 0.85, rocky: 0.5,  gravel: 0.95, muddy: 0.58, grass: 1.2,  brush: 0.8,  concrete: 1},
            tread:  { sand: 1.1,  swamp: 0.4,  forest: 0.95, jungle: 0.9,  rocky: 0.5,  gravel: 1.2,  muddy: 0.72, grass: 1,    brush: 1,    concrete: 1},
            biped:  { sand: 0.65, swamp: 0.5,  forest: 0.95, jungle: 0.7,  rocky: 0.4,  gravel: 1,    muddy: 0.7,  grass: 1.2,  brush: 0.85, concrete: 1},
            quad:   { sand: 0.75, swamp: 0.42, forest: 1.2,  jungle: 1,    rocky: 0.9,  gravel: 0.8,  muddy: 0.5,  grass: 0.95, brush: 0.9,  concrete: 1},
            spider: { sand: 0.65, swamp: 0.78, forest: 0.75, jungle: 0.65, rocky: 1.2,  gravel: 0.75, muddy: 0.82, grass: 1,    brush: 0.95, concrete: 1},
            hover:  { sand: 1,    swamp: 1.2,  forest: 0.48, jungle: 0.35, rocky: 0.68, gravel: 1,    muddy: 1.08, grass: 1,    brush: 0.7,  concrete: 1}
        },
        StatusMod: {
            freeze: (mech) => !mech.equip.includes('radiator') ? 0.25 : 1,
            hot: (mech) => !mech.equip.includes('coolant') ? 0.25 : 1,
            corrosive: (mech) => !mech.equip.includes('ablative') ? mech.equip.includes('shields') ? 0.75 : 0.25 : 1,
            humid: (mech) => !mech.equip.includes('seals') ? 0.75 : 1,
            windy: (mech) => mech.chassis === 'hover' ? 0.5 : 1,
            hilly: (mech) => mech.chassis !== 'spider' ? 0.75 : 1,
            mountain: (mech) => mech.chassis !== 'spider' && !mech.equip.includes('grapple') ? mech.equip.includes('flare') ? 0.75 : 0.5 : 1,
            radioactive: (mech) => !mech.equip.includes('shields') ? 0.5 : 1,
            quake: (mech) => !mech.equip.includes('stabilizer') ? 0.25 : 1,
            dust: (mech) => !mech.equip.includes('seals') ? 0.5 : 1,
            river: (mech) => mech.chassis !== 'hover' ? 0.65 : 1,
            tar: (mech) => mech.chassis !== 'quad' ? mech.chassis === 'tread' || mech.chassis === 'wheel' ? 0.5 : 0.75 : 1,
            steam: (mech) => !mech.equip.includes('shields') ? 0.75 : 1,
            flooded: (mech) => mech.chassis !== 'hover' ? 0.35 : 1,
            fog: (mech) => !mech.equip.includes('sonar') ? 0.2 : 1,
            rain: (mech) => !mech.equip.includes('seals') ? 0.75 : 1,
            hail: (mech) => !mech.equip.includes('ablative') && !mech.equip.includes('shields') ? 0.75 : 1,
            chasm: (mech) => !mech.equip.includes('grapple') ? 0.1 : 1,
            dark: (mech) => !mech.equip.includes('infrared') ? mech.equip.includes('flare') ? 0.25 : 0.1 : 1,
            gravity: (mech) => mech.size === 'titan' ? 0.25 : mech.size === 'large' ? 0.45 : mech.size === 'medium' ? 0.8 : 1,
        },

        mechObserver: new MutationObserver(() => {
            game.updateDebugData(); // Observer can be can be called at any time, make sure we have actual data
            createMechInfo();
        }),

        initLab() {
            if (buildings.SpireMechBay.count < 1) {
                return false;
            }
            this._assemblyVue = getVueById(this._assemblyVueBinding);
            if (this._assemblyVue === undefined) {
                return false;
            }
            this._listVue = getVueById(this._listVueBinding);
            if (this._listVue === undefined) {
                return false;
            }

            this.activeMechs = [];
            this.inactiveMechs = [];
            this.mechsPower = 0;

            let spaceUsed = 0;
            let currentScouts = 0;
            let mechBay = game.global.portal.mechbay;
            for (let i = 0; i < mechBay.mechs.length; i++) {
                let mech = {id: i, ...mechBay.mechs[i], ...this.getMechStats(mechBay.mechs[i])};
                spaceUsed += this.getMechSpace(mech);
                if (spaceUsed <= mechBay.max) {
                    this.activeMechs.push(mech);
                    if (mech.size !== 'collector') {
                        this.mechsPower += mech.power;
                    }
                    if (mech.size === 'small') {
                        currentScouts++;
                    }
                } else {
                    this.inactiveMechs.push(mech);
                }
            }

            if (this.lastLevel !== game.global.portal.spire.count || this.lastPrepared !== game.global.blood.prepared || this.lastWrath !== game.global.blood.wrath || this.lastScouts !== currentScouts || this.lastSpecial !== settings.mechSpecial) {
                this.lastLevel = game.global.portal.spire.count;
                this.lastPrepared = game.global.blood.prepared;
                this.lastWrath = game.global.blood.wrath;
                this.lastScouts = currentScouts;
                this.lastSpecial = settings.mechSpecial;
                this.isActive = true;

                this.updateBestWeapon();
                this.Size.forEach(size => {
                    this.updateBestBody(size);
                    this.bestMech[size] = this.getRandomMech(size);
                });
                this.bestSize = Object.values(this.bestMech).filter(m => m.size !== 'collector').sort((a, b) => b.efficiency - a.efficiency).map(m => m.size);

                // Redraw added label of Mech Lab after change of floor
                createMechInfo();
            }

            let bestMech = this.bestMech[this.bestSize[0]];
            this.mechsPotential = this.mechsPower / (buildings.SpireMechBay.count * 25 / this.getMechSpace(bestMech) * bestMech.power) || 0;

            return true;
        },

        getBodyMod(mech) {
            let floor = game.global.portal.spire;
            let terrainFactor = mech.size === 'small' || mech.size === 'medium' ?
                this.SmallChassisMod[mech.chassis][floor.type]:
                this.LargeChassisMod[mech.chassis][floor.type];

            let rating = poly.terrainRating(mech, terrainFactor, Object.keys(floor.status));
            for (let effect in floor.status) {
                rating *= this.StatusMod[effect](mech);
            }
            return rating;
        },

        getWeaponMod(mech) {
            let weapons = poly.monsters[game.global.portal.spire.boss].weapon;
            let rating = 0;
            for (let i = 0; i < mech.hardpoint.length; i++){
                rating += poly.weaponPower(mech, weapons[mech.hardpoint[i]]);
            }
            return rating;
        },

        getSizeMod(mech, concrete) {
            let isConcrete = concrete ?? game.global.portal.spire.type === 'concrete';
            switch (mech.size){
                case 'small':
                    return 0.0025 * (isConcrete ? 0.92 : 1);
                case 'medium':
                    return 0.0075 * (isConcrete ? 0.95 : 1);
                case 'large':
                    return 0.01;
                case 'titan':
                    return 0.012 * (isConcrete ? 1.25 : 1);
                case 'collector': // For collectors we're calculating supply rate
                    return 25 / this.collectorValue;
            }
            return 0;
        },

        getProgressMod() {
            let mod = 1;
            if (game.global.stats.achieve.gladiator?.l > 0) {
                mod *= 1 + game.global.stats.achieve.gladiator.l * 0.2;
            }
            if (game.global.blood['wrath']){
                mod *= 1 + (game.global.blood.wrath / 20);
            }
            mod /= game.global.portal.spire.count;

            return mod;
        },

        getPreferredSize() {
            let mechBay = game.global.portal.mechbay;
            if (settings.mechFillBay && mechBay.bay % 2 !== mechBay.max % 2 && mechBay.max % 1 === 0) {
                return 'collector'; // One collector to fill odd bay
            }

            if (resources.Supply.storageRatio < 0.9 && resources.Supply.rateOfChange < settings.mechMinSupply) {
                let collectorsCount = this.activeMechs.filter(mech => mech.size === 'collector').length;
                if (collectorsCount / mechBay.max < settings.mechMaxCollectors) {
                    return 'collector'; // Bootstrap income
                }
            }

            if ((this.lastScouts * 2) / mechBay.max < settings.mechScouts) {
                return 'small'; // Build scouts up to configured ratio
            }

            let floorSize = game.global.portal.spire.status.gravity ? settings.mechSizeGravity : settings.mechSize;
            if (floorSize !== "auto") {
                return floorSize; // This floor have configured size
            }

            for (let i = 0; i < this.bestSize.length; i++) {
                let mechSize = this.bestSize[i];
                let {s, c} = poly.mechCost(mechSize);
                if (resources.Soul_Gem.spareQuantity >= s && resources.Supply.maxQuantity >= c) {
                    return mechSize; // Affordable mech for auto size
                }
            }

            return 'titan'; // Just a stub, if auto size couldn't pick anything
        },

        getMechStats(mech) {
            let rating = this.getBodyMod(mech);
            if (mech.size !== 'collector') { // Collectors doesn't have weapons
                rating *= this.getWeaponMod(mech);
            }
            let power = rating * this.getSizeMod(mech) * (mech.infernal ? 1.25 : 1);
            let efficiency = power / this.getMechSpace(mech);
            return {power: power, efficiency: efficiency};
        },

        getTimeToClear() {
            return this.mechsPower > 0 ? (100 - game.global.portal.spire.progress) / (this.mechsPower * this.getProgressMod()) : Number.MAX_SAFE_INTEGER;
        },

        updateBestBody(size) {
            let currentBestBodyMod = 0;
            let currentBestBodyList = [];

            let equipmentSlots = this.SizeSlots[size] + (game.global.blood.prepared ? 1 : 0) - (settings.mechSpecial === "always" ? 1 : 0);
            let equipOptions = settings.mechSpecial === "always" || settings.mechSpecial === "never" ? this.Equip.slice(1) : this.Equip;

            k_combinations(equipOptions, equipmentSlots).forEach((equip) => {
                this.Chassis.forEach(chassis => {
                    let mech = {size: size, chassis: chassis, equip: equip};
                    let mechMod = this.getBodyMod(mech);
                    if (mechMod > currentBestBodyMod) {
                        currentBestBodyMod = mechMod;
                        currentBestBodyList = [mech];
                    } else if (mechMod === currentBestBodyMod) {
                        currentBestBodyList.push(mech);
                    }
                });
            });

            if (settings.mechSpecial === "always" && equipmentSlots >= 0) {
                currentBestBodyList.forEach(mech => mech.equip.unshift('special'));
            }
            if (settings.mechSpecial === "prefered") {
                let specialEquip = currentBestBodyList.filter(mech => mech.equip.includes("special"));
                if (specialEquip.length > 0) {
                    currentBestBodyList = specialEquip;
                }
            }
            this.bestBody[size] = currentBestBodyList;
        },

        updateBestWeapon() {
            let bestMod = 0;
            let list = poly.monsters[game.global.portal.spire.boss].weapon;
            for (let weapon in list) {
                let mod = list[weapon];
                if (mod > bestMod) {
                    bestMod = mod;
                    this.bestWeapon = [weapon];
                } else if (mod === bestMod) {
                    this.bestWeapon.push(weapon);
                }
            }
        },

        getRandomMech(size) {
            let randomBody = this.bestBody[size][Math.floor(Math.random() * this.bestBody[size].length)];
            let randomWeapon = this.bestWeapon[Math.floor(Math.random() * this.bestWeapon.length)];
            let weaponsAmount = this.SizeWeapons[size];
            let mech = {hardpoint: new Array(weaponsAmount).fill(randomWeapon), ...randomBody};
            return {...mech, ...this.getMechStats(mech)};
        },

        getMechSpace(mech) {
            switch (mech.size){
                case 'small':
                    return 2;
                case 'medium':
                    return game.global.blood.prepared >= 2 ? 4 : 5;
                case 'large':
                    return game.global.blood.prepared >= 2 ? 8 : 10;
                case 'titan':
                    return game.global.blood.prepared >= 2 ? 20 : 25;
                case 'collector':
                    return 1;
            }
            return Number.MAX_SAFE_INTEGER;
        },

        getMechCost(mech) {
            let {s, c} = poly.mechCost(mech.size);
            return [s, c, this.getMechSpace(mech)];
        },

        getMechRefund(mech) {
            let {s, c} = poly.mechCost(mech.size);
            return [Math.floor(s / 2), Math.floor(c / 3)];
        },

        mechDesc(mech) {
            // (${mech.hardpoint.map(id => game.loc("portal_mech_weapon_" + id)).join(", ")}) [${mech.equip.map(id => game.loc("portal_mech_equip_" + id)).join(", ")}]
            let rating = mech.power / this.bestMech[mech.size].power;
            return `${game.loc("portal_mech_size_" + mech.size)} ${game.loc("portal_mech_chassis_" + mech.chassis)} (${Math.round(rating * 100)}%)`;
        },

        buildMech(mech) {
            this._assemblyVue.setSize(mech.size);
            this._assemblyVue.setType(mech.chassis);
            for (let i = 0; i < mech.hardpoint.length; i++) {
                this._assemblyVue.setWep(mech.hardpoint[i], i);
            }
            for (let i = 0; i < mech.equip.length; i++) {
                this._assemblyVue.setEquip(mech.equip[i], i);
            }
            this._assemblyVue.build();
            GameLog.logSuccess(GameLog.Types.mech_build, `${this.mechDesc(mech)} mech has been assembled.`);
        },

        scrapMech(mech) {
            this._listVue.scrap(mech.id);
        },

        dragMech(oldId, newId) {
            if (typeof unsafeWindow !== 'undefined') { // Yet another FF fix
                win.Sortable.get(this._listVue.$el).options.onEnd(cloneInto({oldDraggableIndex: oldId, newDraggableIndex: newId}, unsafeWindow));
            } else {
                Sortable.get(this._listVue.$el).options.onEnd({oldDraggableIndex: oldId, newDraggableIndex: newId});
            }
        }
    }

    var JobManager = {
        priorityList: [],
        craftingJobs: [],

        isUnlocked() {
            return jobs.Unemployed.isUnlocked();
        },

        addJobToPriorityList(job) {
            job.priority = this.priorityList.length;
            this.priorityList.push(job);
        },

        addCraftingJob(job) {
            this.craftingJobs.push(job);
        },

        sortByPriority() {
            this.priorityList.sort((a, b) => a.priority - b.priority);
        },

        managedPriorityList() {
            return this.priorityList.filter(job => job.isManaged() && (!(job instanceof CraftingJob) || settings.autoCraftsmen));
        },

        isFoundryUnlocked() {
            let containerNode = document.getElementById("foundry");
            return containerNode !== null && containerNode.style.display !== "none" && containerNode.children.length > 0 && this.maxCraftsmen() > 0;
        },

        maxCraftsmen() {
            return game.global.civic.craftsman.max;
        },

        craftingMax() {
            if (!this.isFoundryUnlocked()) {
                return 0;
            }

            let max = this.maxCraftsmen();
            for (let i = 0; i < this.craftingJobs.length; i++) {
                const job = this.craftingJobs[i];

                if (!settings['craft' + job.resource.id] || !job.isManaged()) {
                    max -= job.count;
                }
            }
            max -= game.global.city.foundry?.Thermite ?? 0;
            return max;
        }
    }

    var BuildingManager = {
        priorityList: [],
        statePriorityList: [],

        updateBuildings() {
            for (let i = 0; i < this.priorityList.length; i++){
                let building = this.priorityList[i];
                building.updateResourceRequirements();
                building.extraDescription = "";
            }
        },

        updateWeighting() {
             // Check generic conditions, and multiplier - x1 have no effect, so skip them too.
            let activeRules = weightingRules.filter(rule => rule[wrGlobalCondition]() && rule[wrMultiplier]() !== 1);

            // Iterate over buildings
            for (let i = 0; i < this.priorityList.length; i++){
                let building = this.priorityList[i];
                building.weighting = building._weighting;

                // Apply weighting rules
                for (let j = 0; j < activeRules.length; j++) {
                    let result = activeRules[j][wrIndividualCondition](building);
                    // Rule passed
                    if (result) {
                        building.extraDescription += activeRules[j][wrDescription](result, building) + "<br>";
                        building.weighting *= activeRules[j][wrMultiplier](result);


                        // Last rule disabled building, no need to check the rest
                        if (building.weighting <= 0) {
                            break;
                        }
                    }
                }
                if (building.weighting > 0) {
                    building.extraDescription = "AutoBuild weighting: " + getNiceNumber(building.weighting) + "<br>" + building.extraDescription;
                }
            }
        },

        addBuildingToPriorityList(building) {
            building.priority = this.priorityList.length;
            this.priorityList.push(building);

            if (building.isSwitchable()) {
                this.statePriorityList.push(building);
            }
        },

        sortByPriority() {
            this.priorityList.sort((a, b) => a.priority - b.priority);
            this.statePriorityList.sort((a, b) => a.priority - b.priority);
        },

        managedPriorityList() {
            return this.priorityList.filter(building => building.weighting > 0);
        },

        managedStatePriorityList() {
            return this.statePriorityList.filter(building => (building.hasState() && building.autoStateEnabled));
        }
    }

    var ProjectManager = {
        priorityList: [],

        updateProjects() {
            for (let i = 0; i < this.priorityList.length; i++){
                let project = this.priorityList[i];
                project.updateResourceRequirements();
                project.extraDescription = "";
            }
        },

        updateWeighting() {
            // Iterate over projects
            for (let i = 0; i < this.priorityList.length; i++){
                let project = this.priorityList[i];
                project.weighting = project._weighting * project.currentStep;

                if (!project.isUnlocked()) {
                    project.weighting = 0;
                    project.extraDescription = "Locked<br>";
                }
                if (!project.autoBuildEnabled || !settings.autoARPA) {
                    project.weighting = 0;
                    project.extraDescription = "AutoBuild disabled<br>";
                }
                if (project.count >= project.autoMax && (project !== projects.ManaSyphon || settings.prestigeType !== 'vacuum')) {
                    project.weighting = 0;
                    project.extraDescription = "Maximum amount reached<br>";
                }
                if (settings.prestigeMADIgnoreArpa && !haveTech("mad") && !game.global.race['cataclysm']) {
                    project.weighting = 0;
                    project.extraDescription = "Projects ignored PreMAD<br>";
                }
                if (state.queuedTargets.includes(project)) {
                    project.weighting = 0;
                    project.extraDescription = "Queued project, processing...<br>";
                }
                if (state.triggerTargets.includes(project)) {
                    project.weighting = 0;
                    project.extraDescription = "Active trigger, processing...<br>";
                }

                if (settings.arpaScaleWeighting) {
                    project.weighting /= 1 - (0.01 * project.progress);
                }
                if (project.weighting > 0) {
                    project.extraDescription = `AutoARPA weighting: ${getNiceNumber(project.weighting)} (${project.currentStep}%)<br>${project.extraDescription}`;
                }
            }
        },

        addProjectToPriorityList(project) {
            project.priority = this.priorityList.length;
            this.priorityList.push(project);
        },

        sortByPriority() {
            this.priorityList.sort((a, b) => a.priority - b.priority);
        },

        managedPriorityList() {
            return this.priorityList.filter(project => project.weighting > 0);
        }
    }

    var TriggerManager = {
        priorityList: [],
        targetTriggers: [],

        resetTargetTriggers() {
            this.targetTriggers = [];
            for (let i = 0; i < this.priorityList.length; i++) {
                let trigger = this.priorityList[i];
                trigger.updateComplete();
                if ((settings.autoResearch || trigger.actionType !== "research") && (settings.autoBuild || trigger.actionType !== "build") && !trigger.complete && trigger.areRequirementsMet() && trigger.isActionPossible() && !this.actionConflicts(trigger)) {
                    this.targetTriggers.push(trigger);
                }
            }
        },

        getTrigger(seq) {
            return this.priorityList.find(trigger => trigger.seq === seq);
        },

        sortByPriority() {
            this.priorityList.sort((a, b) => a.priority - b.priority);
        },

        AddTrigger(requirementType, requirementId, requirementCount, actionType, actionId, actionCount) {
            let trigger = new Trigger(this.priorityList.length, this.priorityList.length, requirementType, requirementId, requirementCount, actionType, actionId, actionCount);
            this.priorityList.push(trigger);
            return trigger;
        },

        AddTriggerFromSetting(raw) {
            let existingSequence = this.priorityList.some(trigger => trigger.seq === raw.seq);
            if (!existingSequence) {
                let trigger = new Trigger(raw.seq, raw.priority, raw.requirementType, raw.requirementId, raw.requirementCount, raw.actionType, raw.actionId, raw.actionCount);
                this.priorityList.push(trigger);
            }
        },

        RemoveTrigger(seq) {
            let indexToRemove = this.priorityList.findIndex(trigger => trigger.seq === seq);

            if (indexToRemove === -1) {
                return;
            }

            this.priorityList.splice(indexToRemove, 1);

            for (let i = 0; i < this.priorityList.length; i++) {
                let trigger = this.priorityList[i];
                trigger.seq = i;
            }
        },

        // This function only checks if two triggers use the same resource, it does not check storage
        actionConflicts(trigger) {
            for (let i = 0; i < this.targetTriggers.length; i++) {
                let targetTrigger = this.targetTriggers[i];

                if (Object.keys(targetTrigger.cost()).some(cost => Object.keys(trigger.cost()).includes(cost))) {
                    return true;
                }
            }

            return false;
        },
    }

    var WindowManager = {
        openedByScript: false,
        _callbackWindowTitle: "",
        _callbackFunction: null,

        currentModalWindowTitle() {
            let modalTitleNode = document.getElementById("modalBoxTitle");
            if (modalTitleNode === null) {
                return "";
            }

            // Modal title will either be a single name or a combination of resource and storage
            // eg. single name "Smelter" or "Factory"
            // eg. combination "Iridium - 26.4K/279.9K"
            let indexOfDash = modalTitleNode.textContent.indexOf(" - ");
            if (indexOfDash === -1) {
                return modalTitleNode.textContent;
            } else {
                return modalTitleNode.textContent.substring(0, indexOfDash);
            }
        },

        openModalWindowWithCallback(elementToClick, callbackWindowTitle, callbackFunction) {
            if (this.isOpen()) {
                return;
            }

            this.openedByScript = true;
            this._callbackWindowTitle = callbackWindowTitle;
            this._callbackFunction = callbackFunction;
            logClick(elementToClick, "open modal " + callbackWindowTitle);
        },

        isOpen() {
            // Checks both the game modal window and our script modal window
            // game = modalBox
            // script = scriptModal
            return this.openedByScript || document.getElementById("modalBox") !== null || document.getElementById("scriptModal")?.style.display === "block";
        },

        checkCallbacks() {
            // We only care if the script itself opened the modal. If the user did it then ignore it.
            // There must be a call back function otherwise there is nothing to do.
            if (WindowManager.currentModalWindowTitle() === WindowManager._callbackWindowTitle &&
                    WindowManager.openedByScript && WindowManager._callbackFunction) {

                WindowManager._callbackFunction();

                let modalCloseBtn = document.querySelector('.modal .modal-close');
                if (modalCloseBtn !== null) {
                    logClick(modalCloseBtn, "closing modal");
                }
            } else {
                // If we hid users's modal - show it back
                let modal = document.querySelector('.modal');
                if (modal !== null) {
                    modal.style.display = "";
                }
            }

            WindowManager.openedByScript = false;
            WindowManager._callbackWindowTitle = "";
            WindowManager._callbackFunction = null;
        }
    }

    var GameLog = {
        Types: {
            special: {name: "Specials", settingKey: "log_special"},
            construction: {name: "Construction", settingKey: "log_construction"},
            multi_construction: {name: "Multi-part Construction", settingKey: "log_multi_construction"},
            arpa: {name: "A.R.P.A Progress", settingKey: "log_arpa"},
            research: {name: "Research", settingKey: "log_research"},
            spying: {name: "Spying", settingKey: "log_spying"},
            attack: {name: "Attack", settingKey: "log_attack"},
            mercenary: {name: "Mercenaries", settingKey: "log_mercenary"},
            mech_build: {name: "Mech Build", settingKey: "log_mech_build"},
            mech_scrap: {name: "Mech Scrap", settingKey: "log_mech_scrap"},
        },

        logSuccess(loggingType, text) {
            if (!settings.logEnabled || !settings[loggingType.settingKey]) {
                return;
            }

            game.messageQueue(text, "success");
        },

        logWarning(loggingType, text) {
            if (!settings.logEnabled || !settings[loggingType.settingKey]) {
                return;
            }

            game.messageQueue(text, "warning");
        },
    }

    // Gui & Init functions
    function initialiseState() {
        // Construct craftable resource list
        for (let [name, costs] of Object.entries(game.craftCost)) {
            if (resources[name]) { // Ignore Thermite
                for (let i = 0; i < costs.length; i++) {
                    resources[name].resourceRequirements.push(new ResourceRequirement(resources[costs[i].r], costs[i].a));
                }
                state.craftableResourceList.push(resources[name]);
            }
        }
        state.lastWasteful = game.global.race.wasteful;
        state.lastLumber = isLumberRace();
        updateTabs();

        // Lets set our crate / container resource requirements
        resources.Crates.resourceRequirements = normalizeProperties([() => isLumberRace() ? {resource: resources.Plywood, quantity: 10} : {resource: resources.Stone, quantity: 200}]);
        resources.Containers.resourceRequirements.push(new ResourceRequirement(resources.Steel, 125));

        JobManager.addCraftingJob(jobs.Scarletite); // Scarletite should be on top
        JobManager.addCraftingJob(jobs.Plywood);
        JobManager.addCraftingJob(jobs.Brick);
        JobManager.addCraftingJob(jobs.WroughtIron);
        JobManager.addCraftingJob(jobs.SheetMetal);
        JobManager.addCraftingJob(jobs.Mythril);
        JobManager.addCraftingJob(jobs.Aerogel);
        JobManager.addCraftingJob(jobs.Nanoweave);

        resetJobState();

        // Construct city builds list
        //buildings.SacrificialAltar.gameMax = 1; // Although it is technically limited to single altar, we don't care about that, as we're going to click it to make sacrifices
        buildings.GasSpaceDock.gameMax = 1;
        buildings.DwarfWorldController.gameMax = 1;
        buildings.GasSpaceDockShipSegment.gameMax = 100;
        buildings.ProximaDyson.gameMax = 100;
        buildings.BlackholeStellarEngine.gameMax = 100;
        buildings.DwarfWorldCollider.gameMax = 1859;

        buildings.ProximaDysonSphere.gameMax = 100;
        buildings.ProximaOrichalcumSphere.gameMax = 100;
        buildings.BlackholeStargate.gameMax = 200;
        buildings.BlackholeStargateComplete.gameMax = 1;
        buildings.SiriusSpaceElevator.gameMax = 100;
        buildings.SiriusGravityDome.gameMax = 100;
        buildings.SiriusAscensionMachine.gameMax = 100;
        buildings.SiriusAscensionTrigger.gameMax = 1;
        buildings.SiriusAscend.gameMax = 1;
        buildings.PitSoulForge.gameMax = 1;
        buildings.GateEastTower.gameMax = 1;
        buildings.GateWestTower.gameMax = 1;
        buildings.RuinsVault.gameMax = 2;
        buildings.SpireBridge.gameMax = 10;
        buildings.GorddonEmbassy.gameMax = 1;
        buildings.Alien1Consulate.gameMax = 1;
        projects.LaunchFacility.gameMax = 1;
        projects.ManaSyphon.gameMax = 80;

        buildings.CoalPower.addResourceConsumption(() => game.global.race.universe === "magic" ? resources.Mana : resources.Coal, () => game.global.race['environmentalist'] ? 0 : game.global.race.universe === "magic" ? 0.05 : 0.65);
        buildings.OilPower.addResourceConsumption(resources.Oil, () => game.global.race['environmentalist'] ? 0 : 0.65);
        buildings.FissionPower.addResourceConsumption(resources.Uranium, 0.1);
        buildings.TouristCenter.addResourceConsumption(resources.Food, 50);

        // Construct space buildings list
        buildings.SpaceNavBeacon.addResourceConsumption(resources.Moon_Support, -1);
        buildings.SpaceNavBeacon.addResourceConsumption(resources.Red_Support, () => haveTech("luna", 3) ? -1 : 0);
        buildings.MoonBase.addResourceConsumption(resources.Moon_Support, -2);
        buildings.MoonBase.addResourceConsumption(resources.Oil, 2);
        buildings.MoonIridiumMine.addResourceConsumption(resources.Moon_Support, 1);
        buildings.MoonHeliumMine.addResourceConsumption(resources.Moon_Support, 1);
        buildings.MoonObservatory.addResourceConsumption(resources.Moon_Support, 1);
        buildings.RedSpaceport.addResourceConsumption(resources.Red_Support, () => game.actions.space.spc_red.spaceport.support() * -1);
        buildings.RedSpaceport.addResourceConsumption(resources.Helium_3, 1.25);
        buildings.RedSpaceport.addResourceConsumption(resources.Food, () => game.global.race['cataclysm'] ? 2 : 25);
        buildings.RedTower.addResourceConsumption(resources.Red_Support, () => game.global.race['cataclysm'] ? -2 : -1);
        buildings.RedLivingQuarters.addResourceConsumption(resources.Red_Support, 1);
        buildings.RedMine.addResourceConsumption(resources.Red_Support, 1);
        buildings.RedFabrication.addResourceConsumption(resources.Red_Support, 1);
        buildings.RedFactory.addResourceConsumption(resources.Helium_3, 1);
        buildings.RedBiodome.addResourceConsumption(resources.Red_Support, 1);
        buildings.RedExoticLab.addResourceConsumption(resources.Red_Support, 1);
        buildings.RedSpaceBarracks.addResourceConsumption(resources.Oil, 2);
        buildings.RedSpaceBarracks.addResourceConsumption(resources.Food, () => game.global.race['cataclysm'] ? 0 : 10);
        buildings.RedVrCenter.addResourceConsumption(resources.Red_Support, 1);
        buildings.HellGeothermal.addResourceConsumption(resources.Helium_3, 0.5);
        buildings.SunSwarmControl.addResourceConsumption(resources.Sun_Support, () => game.actions.space.spc_sun.swarm_control.support() * -1);
        buildings.SunSwarmSatellite.addResourceConsumption(resources.Sun_Support, 1);
        buildings.GasMoonOutpost.addResourceConsumption(resources.Oil, 2);
        buildings.BeltSpaceStation.addResourceConsumption(resources.Belt_Support, -3);
        buildings.BeltSpaceStation.addResourceConsumption(resources.Food, () => game.global.race['cataclysm'] ? 1 : 10);
        buildings.BeltSpaceStation.addResourceConsumption(resources.Helium_3, 2.5);
        buildings.BeltEleriumShip.addResourceConsumption(resources.Belt_Support, 2);
        buildings.BeltIridiumShip.addResourceConsumption(resources.Belt_Support, 1);
        buildings.BeltIronShip.addResourceConsumption(resources.Belt_Support, 1);
        buildings.DwarfEleriumReactor.addResourceConsumption(resources.Elerium, 0.05);

        buildings.AlphaStarport.addResourceConsumption(resources.Alpha_Support, -5);
        buildings.AlphaStarport.addResourceConsumption(resources.Food, 100);
        buildings.AlphaStarport.addResourceConsumption(resources.Helium_3, 5);
        buildings.AlphaHabitat.addResourceConsumption(resources.Alpha_Support, -1);
        buildings.AlphaMiningDroid.addResourceConsumption(resources.Alpha_Support, 1);
        buildings.AlphaProcessing.addResourceConsumption(resources.Alpha_Support, 1);
        buildings.AlphaFusion.addResourceConsumption(resources.Alpha_Support, 1);
        buildings.AlphaFusion.addResourceConsumption(resources.Deuterium, 1.25);
        buildings.AlphaLaboratory.addResourceConsumption(resources.Alpha_Support, 1);
        buildings.AlphaExchange.addResourceConsumption(resources.Alpha_Support, 1);
        buildings.AlphaGraphenePlant.addResourceConsumption(resources.Alpha_Support, 1);
        buildings.AlphaExoticZoo.addResourceConsumption(resources.Alpha_Support, 1);
        buildings.AlphaExoticZoo.addResourceConsumption(resources.Food, 12000);
        buildings.AlphaMegaFactory.addResourceConsumption(resources.Deuterium, 5);

        buildings.ProximaTransferStation.addResourceConsumption(resources.Alpha_Support, -1);
        buildings.ProximaTransferStation.addResourceConsumption(resources.Uranium, 0.28);
        buildings.ProximaCruiser.addResourceConsumption(resources.Helium_3, 6);

        buildings.NebulaNexus.addResourceConsumption(resources.Nebula_Support, -2);
        buildings.NebulaHarvestor.addResourceConsumption(resources.Nebula_Support, 1);
        buildings.NebulaEleriumProspector.addResourceConsumption(resources.Nebula_Support, 1);

        buildings.NeutronMiner.addResourceConsumption(resources.Helium_3, 3);

        buildings.GatewayStarbase.addResourceConsumption(resources.Gateway_Support, -2);
        buildings.GatewayStarbase.addResourceConsumption(resources.Helium_3, 25);
        buildings.GatewayStarbase.addResourceConsumption(resources.Food, 250);
        buildings.GatewayShipDock.addResourceConsumption(resources.Gateway_Support, () => buildings.GatewayStarbase.stateOnCount * -0.25);

        buildings.BologniumShip.addResourceConsumption(resources.Gateway_Support, 1);
        buildings.BologniumShip.addResourceConsumption(resources.Helium_3, 5);
        buildings.ScoutShip.addResourceConsumption(resources.Gateway_Support, 1);
        buildings.ScoutShip.addResourceConsumption(resources.Helium_3, 6);
        buildings.CorvetteShip.addResourceConsumption(resources.Gateway_Support, 1);
        buildings.CorvetteShip.addResourceConsumption(resources.Helium_3, 10);
        buildings.FrigateShip.addResourceConsumption(resources.Gateway_Support, 2);
        buildings.FrigateShip.addResourceConsumption(resources.Helium_3, 25);
        buildings.CruiserShip.addResourceConsumption(resources.Gateway_Support, 3);
        buildings.CruiserShip.addResourceConsumption(resources.Deuterium, 25);
        buildings.Dreadnought.addResourceConsumption(resources.Gateway_Support, 5);
        buildings.Dreadnought.addResourceConsumption(resources.Deuterium, 80);

        buildings.StargateStation.addResourceConsumption(resources.Gateway_Support, -0.5);
        buildings.StargateTelemetryBeacon.addResourceConsumption(resources.Gateway_Support, -0.75);

        buildings.GorddonEmbassy.addResourceConsumption(resources.Food, 7500);
        buildings.GorddonFreighter.addResourceConsumption(resources.Helium_3, 12);

        buildings.Alien1VitreloyPlant.addResourceConsumption(resources.Bolognium, 2.5);
        buildings.Alien1VitreloyPlant.addResourceConsumption(resources.Stanene, 1000);
        buildings.Alien1VitreloyPlant.addResourceConsumption(resources.Money, 50000);
        buildings.Alien1SuperFreighter.addResourceConsumption(resources.Helium_3, 25);

        buildings.Alien2Foothold.addResourceConsumption(resources.Alien_Support, -4);
        buildings.Alien2Foothold.addResourceConsumption(resources.Elerium, 2.5);
        buildings.Alien2ArmedMiner.addResourceConsumption(resources.Alien_Support, 1);
        buildings.Alien2ArmedMiner.addResourceConsumption(resources.Helium_3, 10);
        buildings.Alien2OreProcessor.addResourceConsumption(resources.Alien_Support, 1);
        buildings.Alien2Scavenger.addResourceConsumption(resources.Alien_Support, 1);
        buildings.Alien2Scavenger.addResourceConsumption(resources.Helium_3, 12);

        buildings.ChthonianMineLayer.addResourceConsumption(resources.Helium_3, 8);
        buildings.ChthonianRaider.addResourceConsumption(resources.Helium_3, 18);

        buildings.RuinsInfernoPower.addResourceConsumption(resources.Infernite, 5);
        buildings.RuinsInfernoPower.addResourceConsumption(resources.Coal, 100);
        buildings.RuinsInfernoPower.addResourceConsumption(resources.Oil, 80);

        buildings.LakeHarbour.addResourceConsumption(resources.Lake_Support, -1);
        buildings.LakeBireme.addResourceConsumption(resources.Lake_Support, 1);
        buildings.LakeTransport.addResourceConsumption(resources.Lake_Support, 1);

        buildings.SpirePurifier.addResourceConsumption(resources.Spire_Support, () => haveTech("b_stone", 3) ? -1.25 : -1);
        buildings.SpirePort.addResourceConsumption(resources.Spire_Support, 1);
        buildings.SpireBaseCamp.addResourceConsumption(resources.Spire_Support, 1);
        buildings.SpireMechBay.addResourceConsumption(resources.Spire_Support, 1);

        resetMarketState();
        resetEjectorState();
        resetStorageState();
        resetProjectState();
        resetProductionState();
        resetBuildingState();
        resetMinorTraitState();

        // These are buildings which are specified as powered in the actions definition game code but aren't actually powered in the main.js powered calculations
        BuildingManager.priorityList.forEach(building => {
            if (building.powered > 0) {
                let powerId = (building._location || building._tab) + ":" + building.id;
                if (game.global.power.indexOf(powerId) === -1) {
                    building.overridePowered = 0;
                }
            }
        });
        buildings.Windmill.overridePowered = -1;
        buildings.SunSwarmSatellite.overridePowered = -0.35;
        buildings.ProximaDyson.overridePowered = -1.25;
        buildings.ProximaDysonSphere.overridePowered = -5;
        buildings.ProximaOrichalcumSphere.overridePowered = -8;
        // Numbers aren't exactly correct. That's fine - it won't mess with calculations - it's not something we can turn off and on. We just need to know that they *are* power generators, for autobuild, and that's enough for us.
        // And it doesn't includes Stellar Engine at all. It can generate some power... But only when fully built, and you don't want to build 100 levels of engine just to generate 20MW.
    }

    function initialiseRaces() {
        for (let id in game.actions.evolution) {
            evolutions[id] = new EvolutionAction("", "evolution", id, "");
        }
        let e = evolutions;

        let bilateralSymmetry = [e.bilateral_symmetry, e.multicellular, e.phagocytosis, e.sexual_reproduction];
        let mammals = [e.mammals, ...bilateralSymmetry];

        let genusEvolution = {
            aquatic: [e.sentience, e.aquatic, ...bilateralSymmetry],
            insectoid: [e.sentience, e.athropods, ...bilateralSymmetry],
            humanoid: [e.sentience, e.humanoid, ...mammals],
            giant: [e.sentience, e.gigantism, ...mammals],
            small: [e.sentience, e.dwarfism, ...mammals],
            carnivore: [e.sentience, e.carnivore, e.animalism, ...mammals],
            herbivore: [e.sentience, e.herbivore, e.animalism, ...mammals],
            //omnivore: [e.sentience, e.omnivore, e.animalism, ...mammals],
            demonic: [e.sentience, e.demonic, ...mammals],
            angelic: [e.sentience, e.celestial, ...mammals],
            fey: [e.sentience, e.fey, ...mammals],
            heat: [e.sentience, e.heat, ...mammals],
            polar: [e.sentience, e.polar, ...mammals],
            sand: [e.sentience, e.sand, ...mammals],
            avian: [e.sentience, e.endothermic, e.eggshell, ...bilateralSymmetry],
            reptilian: [e.sentience, e.ectothermic, e.eggshell, ...bilateralSymmetry],
            plant: [e.sentience, e.bryophyte, e.poikilohydric, e.multicellular, e.chloroplasts, e.sexual_reproduction],
            fungi: [e.sentience, e.bryophyte, e.spores, e.multicellular, e.chitin, e.sexual_reproduction]
        }

        for (let id in game.races) {
            // We don't care about protoplasm
            if (id === "protoplasm") {
                continue;
            }

            races[id] = new Race(id);
            races[id].evolutionTree = [e.bunker, e[id], ...(genusEvolution[races[id].genus] ?? [])];
        }
    }

    function resetWarSettings() {
        settings.foreignAttackLivingSoldiersPercent = 90;
        settings.foreignAttackHealthySoldiersPercent = 90;
        settings.foreignHireMercMoneyStoragePercent = 90;
        settings.foreignHireMercCostLowerThanIncome = 1;
        settings.foreignHireMercDeadSoldiers = 1;
        settings.foreignMinAdvantage = 40;
        settings.foreignMaxAdvantage = 50;
        settings.foreignMaxSiegeBattalion = 10;
        settings.foreignProtectSoldiers = false;

        settings.foreignPacifist = false;
        settings.foreignUnification = true;
        settings.foreignForceSabotage = true;
        settings.foreignOccupyLast = true;
        settings.foreignTrainSpy = true;
        settings.foreignSpyMax = 2;
        settings.foreignPowerRequired = 75;
        settings.foreignPolicyInferior = "Annex";
        settings.foreignPolicySuperior = "Sabotage";
        settings.foreignPolicyRival = "Sabotage";
    }

    function resetHellSettings() {
        settings.disableHell = false;
        settings.maxSoulGems = 0;
        settings.hellTurnOffLogMessages = true;
        settings.hellHandlePatrolCount = true;
        settings.hellHomeGarrison = 10;
        settings.hellMinSoldiers = 20;
        settings.hellMinSoldiersPercent = 90;

        settings.hellTargetFortressDamage = 100;
        settings.hellLowWallsMulti = 3;

        settings.hellHandlePatrolSize = true;
        settings.hellPatrolMinRating = 30;
        settings.hellPatrolThreatPercent = 8;
        settings.hellPatrolDroneMod = 5;
        settings.hellPatrolDroidMod = 5;
        settings.hellPatrolBootcampMod = 0;
        settings.hellBolsterPatrolPercentTop = 50;
        settings.hellBolsterPatrolPercentBottom = 20;
        settings.hellBolsterPatrolRating = 300;

        settings.hellAttractorTopThreat = 3000;
        settings.hellAttractorBottomThreat = 1300;
    }

    function resetGeneralSettings() {
        settings.triggerRequest = true;
        settings.queueRequest = true;
        settings.researchRequest = true;
        settings.researchRequestSpace = false;
        settings.missionRequest = true;
        settings.buildingsConflictQueue = true;
        settings.buildingsConflictRQueue = true;
        settings.buildingsConflictPQueue = true;
        settings.genesAssembleGeneAlways = true;
        settings.buildingAlwaysClick = false;
        settings.buildingClickPerTick = 50;
    }

    function resetPrestigeSettings() {
        settings.prestigeType = "none";

        settings.prestigeMADIgnoreArpa = true;
        settings.prestigeMADWait = true;
        settings.prestigeMADPopulation = 1;
        settings.buildPopulation = false;
        settings.prestigeWaitAT = true;
        settings.prestigeBioseedConstruct = true;
        settings.prestigeEnabledBarracks = 100;
        settings.prestigeBioseedProbes = 3;
        settings.prestigeWhiteholeSaveGems = false;
        settings.prestigeWhiteholeMinMass = 8;
        settings.prestigeWhiteholeStabiliseMass = true;
        settings.prestigeWhiteholeEjectEnabled = true;
        settings.prestigeWhiteholeEjectExcess = false;
        settings.prestigeWhiteholeDecayRate = 0.2;
        settings.prestigeWhiteholeEjectAllCount = 100;
        settings.prestigeAscensionSkipCustom = false;
        settings.prestigeAscensionPillar = true;
        settings.prestigeDemonicFloor = 100;
        settings.prestigeDemonicPotential = 0.4;
        settings.prestigeDemonicBomb = false;
    }

    function resetGovernmentSettings() {
        settings.generalMinimumTaxRate = 20;
        settings.generalMinimumMorale = 105;
        settings.generalMaximumMorale = 500;
        settings.govManage = false;
        settings.govInterim = GovernmentManager.Types.democracy.id;
        settings.govFinal = GovernmentManager.Types.technocracy.id;
        settings.govSpace = GovernmentManager.Types.corpocracy.id;
        settings.govGovernor = "none";
    }

    function resetEvolutionSettings() {
        settings.userUniverseTargetName = "none";
        settings.userPlanetTargetName = "none";
        settings.userEvolutionTarget = "auto";
        settings.evolutionQueue = [];
        settings.evolutionQueueEnabled = false;
        settings.evolutionQueueRepeat = false;
        settings.evolutionBackup = false;
        challenges.forEach(set => settings["challenge_" + set[0].id] = false);
    }

    function resetResearchSettings() {
        settings.userResearchTheology_1 = "auto";
        settings.userResearchTheology_2 = "auto";
        settings.researchIgnore = ["tech-purify"];
    }

    function resetMarketState() {
        let defaultState = {autoBuyEnabled: false, autoBuyRatio: 0.5, autoSellEnabled: false, autoSellRatio: 0.9, autoTradeBuyEnabled: true, autoTradeSellEnabled: true, autoTradeWeighting: 1, autoTradePriority: 1};

        let priorityList = Object.values(resources).filter(r => r.isTradable()).reverse();
        for (let [index, resource] of priorityList.entries()) {
            Object.assign(resource, defaultState);
            resource.marketPriority = index;
        }

        resources.Helium_3.autoTradePriority = 2;
        resources.Iridium.autoTradePriority = 9;
        resources.Polymer.autoTradePriority = 9;
        resources.Alloy.autoTradePriority = 9;
        resources.Titanium.autoTradePriority = 8;
        resources.Steel.autoTradePriority = 7;
        resources.Uranium.autoTradePriority = 2;
        resources.Oil.autoTradePriority = 2;
        resources.Coal.autoTradePriority = 2;
        resources.Cement.autoTradePriority = 6;
        resources.Aluminium.autoTradePriority = 4;
        resources.Iron.autoTradePriority = 4;
        resources.Copper.autoTradePriority = 4;
        resources.Furs.autoTradePriority = 5;
        resources.Crystal.autoTradePriority = 9;
        resources.Stone.autoTradePriority = 3;
        resources.Chrysotile.autoTradePriority = 3;
        resources.Lumber.autoTradePriority = 3;
        resources.Food.autoTradePriority = 1;

        MarketManager.priorityList = priorityList;

        for (let i = 0; i < poly.galaxyOffers.length; i++) {
            let resource = resources[poly.galaxyOffers[i].buy.res];
            resource.galaxyMarketWeighting = 1;
            resource.galaxyMarketPriority = i+1;
        }
    }

    function resetMarketSettings() {
        settings.tradeRouteMinimumMoneyPerSecond = 500;
        settings.tradeRouteMinimumMoneyPercentage = 50;
        settings.tradeRouteSellExcess = true;
    }

    function resetStorageState() {
        let defaultState = {autoStorageEnabled: true, storeOverflow: false, _autoCratesMax: -1, _autoContainersMax: -1};

        let priorityList = Object.values(resources).filter(r => r.hasStorage()).reverse();
        for (let [index, resource] of priorityList.entries()) {
            Object.assign(resource, defaultState);
            resource.storagePriority = index;
        }
        resources.Orichalcum.storeOverflow = true;
        resources.Vitreloy.storeOverflow = true;
        resources.Bolognium.storeOverflow = true;

        StorageManager.priorityList = priorityList;
    }

    function resetStorageSettings() {
        settings.storageLimitPreMad = true;
        settings.storageSafeReassign = true;
        settings.storageAssignExtra = true;
        settings.storagePrioritizedOnly = false;
    }

    function resetMinorTraitState() {
        MinorTraitManager.priorityList = [];

        for (let i = 0; i < minorTraits.length; i++){
            let trait = new MinorTrait(minorTraits[i]);
            trait.enabled = true;
            trait.weighting = 1;

            MinorTraitManager.addMinorTraitToPriorityList(trait);
        }
    }

    function resetJobSettings() {
        settings.jobSetDefault = true;
        settings.jobLumberWeighting = 50;
        settings.jobQuarryWeighting = 50;
        settings.jobCrystalWeighting = 50;
        settings.jobScavengerWeighting = 50;
        settings.jobDisableMiners = true;
        settings.jobDisableCraftsmans = true;

        JobManager.priorityList.forEach(job => job.autoJobEnabled = true);
    }

    function resetJobState() {
        JobManager.priorityList = [];

        JobManager.addJobToPriorityList(jobs.Unemployed);
        JobManager.addJobToPriorityList(jobs.Hunter);
        JobManager.addJobToPriorityList(jobs.Farmer);
        //JobManager.addJobToPriorityList(jobs.Forager);
        JobManager.addJobToPriorityList(jobs.Lumberjack);
        JobManager.addJobToPriorityList(jobs.QuarryWorker);
        JobManager.addJobToPriorityList(jobs.CrystalMiner);
        JobManager.addJobToPriorityList(jobs.Scavenger);
        JobManager.addJobToPriorityList(jobs.Entertainer);
        JobManager.addJobToPriorityList(jobs.Scientist);
        JobManager.addJobToPriorityList(jobs.Professor);
        JobManager.addJobToPriorityList(jobs.CementWorker);
        JobManager.addJobToPriorityList(jobs.Colonist);
        JobManager.addJobToPriorityList(jobs.HellSurveyor);
        JobManager.addJobToPriorityList(jobs.SpaceMiner);
        JobManager.addJobToPriorityList(jobs.Archaeologist);
        JobManager.addJobToPriorityList(jobs.Miner);
        JobManager.addJobToPriorityList(jobs.CoalMiner);
        JobManager.addJobToPriorityList(jobs.Banker);
        JobManager.addJobToPriorityList(jobs.Priest);
        JobManager.addJobToPriorityList(jobs.Plywood);
        JobManager.addJobToPriorityList(jobs.Brick);
        JobManager.addJobToPriorityList(jobs.WroughtIron);
        JobManager.addJobToPriorityList(jobs.SheetMetal);
        JobManager.addJobToPriorityList(jobs.Mythril);
        JobManager.addJobToPriorityList(jobs.Aerogel);
        JobManager.addJobToPriorityList(jobs.Nanoweave);
        JobManager.addJobToPriorityList(jobs.Scarletite);

        jobs.Unemployed.breakpoints = [0, 0, 0];
        jobs.Hunter.breakpoints = [0, 0, 0];
        jobs.Farmer.breakpoints = [0, 0, 0]; // Farmers are calculated based on food rate of change only, ignoring cap
        //jobs.Forager.breakpoints = [4, 10, 0];
        jobs.Lumberjack.breakpoints = [4, 10, 0]; // Basic jobs are special - remaining workers divided between them
        jobs.QuarryWorker.breakpoints = [4, 10, 0]; // Basic jobs are special - remaining workers divided between them
        jobs.CrystalMiner.breakpoints = [2, 5, 0]; // Basic jobs are special - remaining workers divided between them
        jobs.Scavenger.breakpoints = [0, 0, 0]; // Basic jobs are special - remaining workers divided between them

        jobs.Scientist.breakpoints = [3, 6, -1];
        jobs.Professor.breakpoints = [6, 10, -1];
        jobs.Entertainer.breakpoints = [2, 5, -1];
        jobs.CementWorker.breakpoints = [4, 8, -1]; // Cement works are based on cap and stone rate of change
        jobs.Colonist.breakpoints = [0, 0, -1];
        jobs.HellSurveyor.breakpoints = [0, 0, -1];
        jobs.SpaceMiner.breakpoints = [0, 0, -1];
        jobs.Archaeologist.breakpoints = [0, 0, -1];
        jobs.Miner.breakpoints = [3, 5, -1];
        jobs.CoalMiner.breakpoints = [2, 4, -1];
        jobs.Banker.breakpoints = [3, 5, -1];
        jobs.Priest.breakpoints = [0, 0, -1];
    }

    function resetWeightingSettings() {
        settings.buildingWeightingNew = 3;
        settings.buildingWeightingUselessPowerPlant = 0.01;
        settings.buildingWeightingNeedfulPowerPlant = 3;
        settings.buildingWeightingUnderpowered = 0.8;
        settings.buildingWeightingUselessKnowledge = 0.01;
        settings.buildingWeightingNeedfulKnowledge = 5;
        settings.buildingWeightingMissingFuel = 10;
        settings.buildingWeightingNonOperatingCity = 0.2;
        settings.buildingWeightingNonOperating = 0;
        settings.buildingWeightingMissingSupply = 0;
        settings.buildingWeightingMissingSupport = 0;
        settings.buildingWeightingUselessSupport = 0.01;
        settings.buildingWeightingMADUseless = 0;
        settings.buildingWeightingUnusedEjectors = 0.1;
        settings.buildingWeightingCrateUseless = 0.01;
        settings.buildingWeightingHorseshoeUseless = 0.01;
        settings.buildingWeightingZenUseless = 0.01;
        settings.buildingWeightingGateTurret = 0.01;
        settings.buildingWeightingNeedStorage = 1;
    }

    function resetBuildingSettings() {
        settings.buildingBuildIfStorageFull = false;
        settings.buildingsIgnoreZeroRate = false;
        settings.buildingShrineType = "know";
        settings.buildingTowerSuppression = 100;

        for (let i = 0; i < BuildingManager.priorityList.length; i++) {
            const building = BuildingManager.priorityList[i];

            building.autoBuildEnabled = true;
            building.autoStateEnabled = true;
            building._autoMax = -1;
            building._weighting = 100;
        }
    }

    function resetBuildingState() {
        BuildingManager.priorityList = [];
        BuildingManager.statePriorityList = [];

        BuildingManager.addBuildingToPriorityList(buildings.Windmill);
        BuildingManager.addBuildingToPriorityList(buildings.Mill);

        BuildingManager.addBuildingToPriorityList(buildings.CoalPower);
        BuildingManager.addBuildingToPriorityList(buildings.OilPower);
        BuildingManager.addBuildingToPriorityList(buildings.FissionPower);

        BuildingManager.addBuildingToPriorityList(buildings.RuinsHellForge);
        BuildingManager.addBuildingToPriorityList(buildings.RuinsInfernoPower);
        BuildingManager.addBuildingToPriorityList(buildings.RuinsArcology);
        BuildingManager.addBuildingToPriorityList(buildings.Apartment);
        BuildingManager.addBuildingToPriorityList(buildings.Barracks);
        BuildingManager.addBuildingToPriorityList(buildings.TouristCenter);
        BuildingManager.addBuildingToPriorityList(buildings.University);
        BuildingManager.addBuildingToPriorityList(buildings.Smelter);
        BuildingManager.addBuildingToPriorityList(buildings.Temple);
        BuildingManager.addBuildingToPriorityList(buildings.OilWell);
        BuildingManager.addBuildingToPriorityList(buildings.StorageYard);
        BuildingManager.addBuildingToPriorityList(buildings.Warehouse);
        BuildingManager.addBuildingToPriorityList(buildings.Bank);
        BuildingManager.addBuildingToPriorityList(buildings.Hospital);
        BuildingManager.addBuildingToPriorityList(buildings.BootCamp);
        BuildingManager.addBuildingToPriorityList(buildings.House);
        BuildingManager.addBuildingToPriorityList(buildings.Cottage);
        BuildingManager.addBuildingToPriorityList(buildings.Farm);
        BuildingManager.addBuildingToPriorityList(buildings.Silo);
        BuildingManager.addBuildingToPriorityList(buildings.Shed);
        BuildingManager.addBuildingToPriorityList(buildings.LumberYard);
        BuildingManager.addBuildingToPriorityList(buildings.Foundry);
        BuildingManager.addBuildingToPriorityList(buildings.OilDepot);
        BuildingManager.addBuildingToPriorityList(buildings.Trade);
        BuildingManager.addBuildingToPriorityList(buildings.Amphitheatre);
        BuildingManager.addBuildingToPriorityList(buildings.Library);
        BuildingManager.addBuildingToPriorityList(buildings.Wharf);
        BuildingManager.addBuildingToPriorityList(buildings.Lodge); // Carnivore/Detritivore/Soul Eater trait
        BuildingManager.addBuildingToPriorityList(buildings.Smokehouse); // Carnivore trait
        BuildingManager.addBuildingToPriorityList(buildings.SoulWell); // Soul Eater trait
        BuildingManager.addBuildingToPriorityList(buildings.SlavePen); // Slaver trait
        BuildingManager.addBuildingToPriorityList(buildings.SlaveMarket); // Slaver trait
        BuildingManager.addBuildingToPriorityList(buildings.Graveyard); // Evil trait
        BuildingManager.addBuildingToPriorityList(buildings.Shrine); // Magnificent trait
        BuildingManager.addBuildingToPriorityList(buildings.CompostHeap); // Detritivore trait
        BuildingManager.addBuildingToPriorityList(buildings.Pylon); // Magic Universe only
        BuildingManager.addBuildingToPriorityList(buildings.ForgeHorseshoe); // Hooved trait
        BuildingManager.addBuildingToPriorityList(buildings.RedForgeHorseshoe); // Hooved trait
        BuildingManager.addBuildingToPriorityList(buildings.SacrificialAltar); // Cannibalize trait
        BuildingManager.addBuildingToPriorityList(buildings.MeditationChamber); // Calm trait

        BuildingManager.addBuildingToPriorityList(buildings.DwarfMission);
        BuildingManager.addBuildingToPriorityList(buildings.DwarfEleriumReactor);
        BuildingManager.addBuildingToPriorityList(buildings.DwarfWorldCollider);

        BuildingManager.addBuildingToPriorityList(buildings.HellMission);
        BuildingManager.addBuildingToPriorityList(buildings.HellGeothermal);
        BuildingManager.addBuildingToPriorityList(buildings.HellSwarmPlant);

        BuildingManager.addBuildingToPriorityList(buildings.ProximaTransferStation);
        BuildingManager.addBuildingToPriorityList(buildings.ProximaMission);
        BuildingManager.addBuildingToPriorityList(buildings.ProximaCargoYard);
        BuildingManager.addBuildingToPriorityList(buildings.ProximaCruiser);
        BuildingManager.addBuildingToPriorityList(buildings.ProximaDyson);
        BuildingManager.addBuildingToPriorityList(buildings.ProximaDysonSphere);
        BuildingManager.addBuildingToPriorityList(buildings.ProximaOrichalcumSphere);

        BuildingManager.addBuildingToPriorityList(buildings.AlphaMission);
        BuildingManager.addBuildingToPriorityList(buildings.AlphaStarport);
        BuildingManager.addBuildingToPriorityList(buildings.AlphaFusion);
        BuildingManager.addBuildingToPriorityList(buildings.AlphaHabitat);
        BuildingManager.addBuildingToPriorityList(buildings.AlphaLuxuryCondo);
        BuildingManager.addBuildingToPriorityList(buildings.AlphaMiningDroid);
        BuildingManager.addBuildingToPriorityList(buildings.AlphaProcessing);
        BuildingManager.addBuildingToPriorityList(buildings.AlphaLaboratory);
        BuildingManager.addBuildingToPriorityList(buildings.AlphaExoticZoo);
        BuildingManager.addBuildingToPriorityList(buildings.AlphaExchange);
        BuildingManager.addBuildingToPriorityList(buildings.AlphaGraphenePlant);
        BuildingManager.addBuildingToPriorityList(buildings.AlphaWarehouse);

        BuildingManager.addBuildingToPriorityList(buildings.SpaceTestLaunch);
        BuildingManager.addBuildingToPriorityList(buildings.SpaceSatellite);
        BuildingManager.addBuildingToPriorityList(buildings.SpaceGps);
        BuildingManager.addBuildingToPriorityList(buildings.SpacePropellantDepot);
        BuildingManager.addBuildingToPriorityList(buildings.SpaceNavBeacon);

        BuildingManager.addBuildingToPriorityList(buildings.RedMission);
        BuildingManager.addBuildingToPriorityList(buildings.RedTower);
        BuildingManager.addBuildingToPriorityList(buildings.RedSpaceport);
        BuildingManager.addBuildingToPriorityList(buildings.RedLivingQuarters);
        BuildingManager.addBuildingToPriorityList(buildings.RedBiodome);
        BuildingManager.addBuildingToPriorityList(buildings.RedSpaceBarracks);
        BuildingManager.addBuildingToPriorityList(buildings.RedExoticLab);
        BuildingManager.addBuildingToPriorityList(buildings.RedFabrication);
        BuildingManager.addBuildingToPriorityList(buildings.RedMine);
        BuildingManager.addBuildingToPriorityList(buildings.RedVrCenter);
        BuildingManager.addBuildingToPriorityList(buildings.RedZiggurat);
        BuildingManager.addBuildingToPriorityList(buildings.RedGarage);

        BuildingManager.addBuildingToPriorityList(buildings.MoonMission);
        BuildingManager.addBuildingToPriorityList(buildings.MoonBase);
        BuildingManager.addBuildingToPriorityList(buildings.MoonObservatory);
        BuildingManager.addBuildingToPriorityList(buildings.MoonHeliumMine);
        BuildingManager.addBuildingToPriorityList(buildings.MoonIridiumMine);

        BuildingManager.addBuildingToPriorityList(buildings.SunMission);
        BuildingManager.addBuildingToPriorityList(buildings.SunSwarmControl);
        BuildingManager.addBuildingToPriorityList(buildings.SunSwarmSatellite);

        BuildingManager.addBuildingToPriorityList(buildings.GasMission);
        BuildingManager.addBuildingToPriorityList(buildings.GasStorage);
        BuildingManager.addBuildingToPriorityList(buildings.GasSpaceDock);
        BuildingManager.addBuildingToPriorityList(buildings.GasSpaceDockProbe);
        BuildingManager.addBuildingToPriorityList(buildings.GasSpaceDockShipSegment);

        BuildingManager.addBuildingToPriorityList(buildings.GasMoonMission);
        BuildingManager.addBuildingToPriorityList(buildings.GasMoonDrone);

        BuildingManager.addBuildingToPriorityList(buildings.Blackhole);
        BuildingManager.addBuildingToPriorityList(buildings.BlackholeStellarEngine);
        BuildingManager.addBuildingToPriorityList(buildings.BlackholeJumpShip);
        BuildingManager.addBuildingToPriorityList(buildings.BlackholeWormholeMission);
        BuildingManager.addBuildingToPriorityList(buildings.BlackholeStargate);

        BuildingManager.addBuildingToPriorityList(buildings.SiriusMission);
        BuildingManager.addBuildingToPriorityList(buildings.SiriusAnalysis);
        BuildingManager.addBuildingToPriorityList(buildings.SiriusSpaceElevator);
        BuildingManager.addBuildingToPriorityList(buildings.SiriusGravityDome);
        BuildingManager.addBuildingToPriorityList(buildings.SiriusThermalCollector);
        BuildingManager.addBuildingToPriorityList(buildings.SiriusAscensionMachine);
        //BuildingManager.addBuildingToPriorityList(buildings.SiriusAscend); // This is performing the actual ascension. We'll deal with this in prestige automation

        BuildingManager.addBuildingToPriorityList(buildings.BlackholeStargateComplete); // Should be powered before Andromeda

        BuildingManager.addBuildingToPriorityList(buildings.GatewayMission);
        BuildingManager.addBuildingToPriorityList(buildings.GatewayStarbase);
        BuildingManager.addBuildingToPriorityList(buildings.GatewayShipDock);

        BuildingManager.addBuildingToPriorityList(buildings.StargateStation);
        BuildingManager.addBuildingToPriorityList(buildings.StargateTelemetryBeacon);

        BuildingManager.addBuildingToPriorityList(buildings.Dreadnought);
        BuildingManager.addBuildingToPriorityList(buildings.CruiserShip);
        BuildingManager.addBuildingToPriorityList(buildings.FrigateShip);
        BuildingManager.addBuildingToPriorityList(buildings.BologniumShip);
        BuildingManager.addBuildingToPriorityList(buildings.CorvetteShip);
        BuildingManager.addBuildingToPriorityList(buildings.ScoutShip);

        BuildingManager.addBuildingToPriorityList(buildings.GorddonMission);
        BuildingManager.addBuildingToPriorityList(buildings.GorddonEmbassy);
        BuildingManager.addBuildingToPriorityList(buildings.GorddonDormitory);
        BuildingManager.addBuildingToPriorityList(buildings.GorddonSymposium);
        BuildingManager.addBuildingToPriorityList(buildings.GorddonFreighter);

        BuildingManager.addBuildingToPriorityList(buildings.SiriusAscensionTrigger); // This is the 10,000 power one, buildings below this one should be safe to underpower for ascension. Buildings above this either provides, or support population
        BuildingManager.addBuildingToPriorityList(buildings.BlackholeMassEjector); // Top priority of safe buildings, disable *only* for ascension, otherwise we want to have them on at any cost, to keep pumping black hole

        BuildingManager.addBuildingToPriorityList(buildings.Alien1Consulate);
        BuildingManager.addBuildingToPriorityList(buildings.Alien1Resort);
        BuildingManager.addBuildingToPriorityList(buildings.Alien1VitreloyPlant);
        BuildingManager.addBuildingToPriorityList(buildings.Alien1SuperFreighter);

        //BuildingManager.addBuildingToPriorityList(buildings.Alien2Mission);
        BuildingManager.addBuildingToPriorityList(buildings.Alien2Foothold);
        BuildingManager.addBuildingToPriorityList(buildings.Alien2Scavenger);
        BuildingManager.addBuildingToPriorityList(buildings.Alien2ArmedMiner);
        BuildingManager.addBuildingToPriorityList(buildings.Alien2OreProcessor);

        //BuildingManager.addBuildingToPriorityList(buildings.ChthonianMission);
        BuildingManager.addBuildingToPriorityList(buildings.ChthonianMineLayer);
        BuildingManager.addBuildingToPriorityList(buildings.ChthonianExcavator);
        BuildingManager.addBuildingToPriorityList(buildings.ChthonianRaider);

        BuildingManager.addBuildingToPriorityList(buildings.Wardenclyffe);
        BuildingManager.addBuildingToPriorityList(buildings.BioLab);
        BuildingManager.addBuildingToPriorityList(buildings.DwarfWorldController);
        BuildingManager.addBuildingToPriorityList(buildings.BlackholeFarReach);

        BuildingManager.addBuildingToPriorityList(buildings.NebulaMission);
        BuildingManager.addBuildingToPriorityList(buildings.NebulaNexus);
        BuildingManager.addBuildingToPriorityList(buildings.NebulaHarvestor);
        BuildingManager.addBuildingToPriorityList(buildings.NebulaEleriumProspector);

        BuildingManager.addBuildingToPriorityList(buildings.BeltMission);
        BuildingManager.addBuildingToPriorityList(buildings.BeltSpaceStation);
        BuildingManager.addBuildingToPriorityList(buildings.BeltEleriumShip);
        BuildingManager.addBuildingToPriorityList(buildings.BeltIridiumShip);
        BuildingManager.addBuildingToPriorityList(buildings.BeltIronShip);

        BuildingManager.addBuildingToPriorityList(buildings.CementPlant);
        BuildingManager.addBuildingToPriorityList(buildings.Factory);
        BuildingManager.addBuildingToPriorityList(buildings.GasMoonOutpost);
        BuildingManager.addBuildingToPriorityList(buildings.StargateDefensePlatform);
        BuildingManager.addBuildingToPriorityList(buildings.RedFactory);
        BuildingManager.addBuildingToPriorityList(buildings.AlphaMegaFactory);

        BuildingManager.addBuildingToPriorityList(buildings.PortalTurret);
        BuildingManager.addBuildingToPriorityList(buildings.BadlandsSensorDrone);
        BuildingManager.addBuildingToPriorityList(buildings.PortalWarDroid);
        BuildingManager.addBuildingToPriorityList(buildings.BadlandsPredatorDrone);
        BuildingManager.addBuildingToPriorityList(buildings.BadlandsAttractor);
        BuildingManager.addBuildingToPriorityList(buildings.PortalCarport);
        BuildingManager.addBuildingToPriorityList(buildings.PitSoulForge);
        BuildingManager.addBuildingToPriorityList(buildings.PitGunEmplacement);
        BuildingManager.addBuildingToPriorityList(buildings.PitSoulAttractor);
        BuildingManager.addBuildingToPriorityList(buildings.PortalRepairDroid);
        BuildingManager.addBuildingToPriorityList(buildings.PitMission);
        BuildingManager.addBuildingToPriorityList(buildings.PitAssaultForge);
        BuildingManager.addBuildingToPriorityList(buildings.RuinsAncientPillars);

        BuildingManager.addBuildingToPriorityList(buildings.RuinsMission);
        BuildingManager.addBuildingToPriorityList(buildings.RuinsGuardPost);
        BuildingManager.addBuildingToPriorityList(buildings.RuinsVault);
        BuildingManager.addBuildingToPriorityList(buildings.RuinsArchaeology);

        BuildingManager.addBuildingToPriorityList(buildings.GateMission);
        BuildingManager.addBuildingToPriorityList(buildings.GateEastTower);
        BuildingManager.addBuildingToPriorityList(buildings.GateWestTower);
        BuildingManager.addBuildingToPriorityList(buildings.GateTurret);
        BuildingManager.addBuildingToPriorityList(buildings.GateInferniteMine);

        BuildingManager.addBuildingToPriorityList(buildings.SpireMission);
        BuildingManager.addBuildingToPriorityList(buildings.SpirePurifier);
        BuildingManager.addBuildingToPriorityList(buildings.SpireMechBay);
        BuildingManager.addBuildingToPriorityList(buildings.SpireBaseCamp);
        BuildingManager.addBuildingToPriorityList(buildings.SpirePort);
        BuildingManager.addBuildingToPriorityList(buildings.SpireBridge);
        BuildingManager.addBuildingToPriorityList(buildings.SpireSphinx);
        BuildingManager.addBuildingToPriorityList(buildings.SpireBribeSphinx);
        BuildingManager.addBuildingToPriorityList(buildings.SpireSurveyTower);
        BuildingManager.addBuildingToPriorityList(buildings.SpireWaygate);

        BuildingManager.addBuildingToPriorityList(buildings.LakeMission);
        BuildingManager.addBuildingToPriorityList(buildings.LakeCoolingTower);
        BuildingManager.addBuildingToPriorityList(buildings.LakeHarbour);
        BuildingManager.addBuildingToPriorityList(buildings.LakeBireme);
        BuildingManager.addBuildingToPriorityList(buildings.LakeTransport);

        BuildingManager.addBuildingToPriorityList(buildings.StargateDepot);
        BuildingManager.addBuildingToPriorityList(buildings.DwarfEleriumContainer);

        BuildingManager.addBuildingToPriorityList(buildings.GasMoonOilExtractor);
        BuildingManager.addBuildingToPriorityList(buildings.NeutronMission);
        BuildingManager.addBuildingToPriorityList(buildings.NeutronStellarForge);
        BuildingManager.addBuildingToPriorityList(buildings.NeutronMiner);

        BuildingManager.addBuildingToPriorityList(buildings.MassDriver);
        BuildingManager.addBuildingToPriorityList(buildings.MetalRefinery);
        BuildingManager.addBuildingToPriorityList(buildings.Casino);
        BuildingManager.addBuildingToPriorityList(buildings.HellSpaceCasino);
        BuildingManager.addBuildingToPriorityList(buildings.RockQuarry);
        BuildingManager.addBuildingToPriorityList(buildings.Sawmill);
        BuildingManager.addBuildingToPriorityList(buildings.GasMining);
        BuildingManager.addBuildingToPriorityList(buildings.NeutronCitadel);
        BuildingManager.addBuildingToPriorityList(buildings.Mine);
        BuildingManager.addBuildingToPriorityList(buildings.CoalMine);

        // AutoBuild disabled by default for early(ish) buildings consuming Soul Gems
        buildings.RedVrCenter.autoBuildEnabled = false;
        buildings.NeutronCitadel.autoBuildEnabled = false;
        buildings.PortalWarDroid.autoBuildEnabled = false;
        buildings.BadlandsPredatorDrone.autoBuildEnabled = false;
        buildings.PortalRepairDroid.autoBuildEnabled = false;

        // And Blood Stone
        buildings.SpireWaygate.autoBuildEnabled = false;

        buildings.ForgeHorseshoe._autoMax = 20;
        buildings.RedForgeHorseshoe._autoMax = 20;
    }

    function resetProjectSettings() {
        settings.arpaScaleWeighting = true;
        settings.arpaStep = 10;
    }

    function resetProjectState() {
        ProjectManager.priorityList = [];

        for (let key in projects) {
            let project = projects[key];
            project._autoMax = -1;
            project._weighting = 1;
            project.autoBuildEnabled = true;

            ProjectManager.addProjectToPriorityList(project);
        }

        projects.LaunchFacility._weighting = 100;
        projects.SuperCollider._weighting = 5;
        projects.Railway._weighting = 0.1;
        projects.StockExchange._weighting = 0.5;
        projects.ManaSyphon._autoMax = 79;
        projects.ManaSyphon.autoBuildEnabled = false;
    }

    function resetProductionSettings() {
        settings.productionChrysotileWeight = 2;
        settings.productionFoundryWeighting = "demanded";
        settings.productionRitualManaUse = 0.5;
        settings.productionSmelting = "storage";
        settings.productionFactoryMinIngredients = 0.01;
    }

    function resetProductionState() {
        // Smelter settings
        let smelterPriority = 0;
        SmelterManager.Fuels.Inferno.priority = smelterPriority++;
        SmelterManager.Fuels.Oil.priority = smelterPriority++;
        SmelterManager.Fuels.Star.priority = smelterPriority++;
        SmelterManager.Fuels.Coal.priority = smelterPriority++;
        SmelterManager.Fuels.Wood.priority = smelterPriority++;

        // Factory settings
        Object.assign(FactoryManager.Productions.LuxuryGoods, {enabled: true, weighting: 1, priority: 2});
        Object.assign(FactoryManager.Productions.Furs, {enabled: true, weighting: 1, priority: 1});
        Object.assign(FactoryManager.Productions.Alloy, {enabled: true, weighting: 1, priority: 3});
        Object.assign(FactoryManager.Productions.Polymer, {enabled: true, weighting: 1, priority: 3});
        Object.assign(FactoryManager.Productions.NanoTube, {enabled: true, weighting: 4, priority: 3});
        Object.assign(FactoryManager.Productions.Stanene, {enabled: true, weighting: 4, priority: 3});

        Object.assign(resources.Plywood, {autoCraftEnabled: true, craftWeighting: 1, craftPreserve: 0});
        Object.assign(resources.Brick, {autoCraftEnabled: true, craftWeighting: 1, craftPreserve: 0});
        Object.assign(resources.Wrought_Iron, {autoCraftEnabled: true, craftWeighting: 1, craftPreserve: 0});
        Object.assign(resources.Sheet_Metal, {autoCraftEnabled: true, craftWeighting: 2, craftPreserve: 0});
        Object.assign(resources.Mythril, {autoCraftEnabled: true, craftWeighting: 3, craftPreserve: 0});
        Object.assign(resources.Aerogel, {autoCraftEnabled: true, craftWeighting: 3, craftPreserve: 0});
        Object.assign(resources.Nanoweave, {autoCraftEnabled: true, craftWeighting: 10, craftPreserve: 0});
        Object.assign(resources.Scarletite, {autoCraftEnabled: true, craftWeighting: 1, craftPreserve: 0});

        Object.assign(DroidManager.Productions.Adamantite, {priority: 1, weighting: 10});
        Object.assign(DroidManager.Productions.Aluminium, {priority: 1, weighting: 1});
        Object.assign(DroidManager.Productions.Uranium, {priority: -1, weighting: 10});
        Object.assign(DroidManager.Productions.Coal, {priority: -1, weighting: 10});

        Object.values(RitualManager.Productions).forEach(spell => spell.weighting = 100);
        RitualManager.Productions.Hunting.weighting = 10;
        RitualManager.Productions.Farmer.weighting = 1;
    }

    function resetTriggerState() {
        TriggerManager.priorityList = [];
    }

    function resetLoggingSettings() {
        settings.logEnabled = true;
        Object.values(GameLog.Types).forEach(log => settings[log.settingKey] = true);
        settings[GameLog.Types.arpa.settingKey] = false;

        settings.logFilter = "";
    }

    function updateStateFromSettings() {
        updateStandAloneSettings();

        TriggerManager.priorityList = [];
        settings.triggers.forEach(trigger => TriggerManager.AddTriggerFromSetting(trigger));

        for (let i = 0; i < MinorTraitManager.priorityList.length; i++) {
            let trait = MinorTraitManager.priorityList[i];
            trait.enabled = settings['mTrait_' + trait.traitName] ?? trait.enabled;
            trait.weighting = parseFloat(settings['mTrait_w_' + trait.traitName] ?? trait.weighting);
            trait.priority = parseFloat(settings['mTrait_p_' + trait.traitName] ?? trait.priority);
        }
        MinorTraitManager.sortByPriority();

        for (let i = 0; i < state.craftableResourceList.length; i++) {
            let resource = state.craftableResourceList[i];
            resource.autoCraftEnabled = settings['craft' + resource.id] ?? resource.autoCraftEnabled;
            resource.craftWeighting = parseFloat(settings['foundry_w_' + resource.id] ?? resource.craftWeighting);
            resource.craftPreserve = parseFloat(settings['foundry_p_' + resource.id] ?? resource.craftPreserve);
        }

        for (let i = 0; i < BuildingManager.priorityList.length; i++) {
            let building = BuildingManager.priorityList[i];
            building.autoBuildEnabled = settings['bat' + building._vueBinding] ?? building.autoBuildEnabled;
            building.priority = parseInt(settings['bld_p_' + building._vueBinding] ?? building.priority);
            building._autoMax = parseInt(settings['bld_m_' + building._vueBinding] ?? building._autoMax);
            building._weighting = parseFloat(settings['bld_w_' + building._vueBinding] ?? building._weighting);
            if (building.isSwitchable()) {
                building.autoStateEnabled = settings['bld_s_' + building._vueBinding] ?? building.autoStateEnabled;
            }
            if (building.is.smart) {
                building.autoStateSmart = settings['bld_s2_' + building._vueBinding] ?? building.autoStateSmart;
            }
        }
        BuildingManager.sortByPriority();

        for (let i = 0; i < JobManager.priorityList.length; i++) {
            let job = JobManager.priorityList[i];
            job.autoJobEnabled = settings['job_' + job._originalId] ?? job.autoJobEnabled;
            job.priority = parseInt(settings['job_p_' + job._originalId] ?? job.priority);
            job.breakpoints[0] = settings['job_b1_' + job._originalId] ?? job.breakpoints[0];
            job.breakpoints[1] = settings['job_b2_' + job._originalId] ?? job.breakpoints[1];
            job.breakpoints[2] = settings['job_b3_' + job._originalId] ?? job.breakpoints[2];
        }
        JobManager.sortByPriority();

        settings.arpa = settings.arpa ?? {};
        for (let i = 0; i < ProjectManager.priorityList.length; i++) {
            let project = ProjectManager.priorityList[i];
            project.autoBuildEnabled = settings.arpa[project.id] ?? project.autoBuildEnabled;
            project.priority = parseInt(settings['arpa_p_' + project.id] ?? project.priority);
            project._autoMax = parseInt(settings['arpa_m_' + project.id] ?? project._autoMax);
            project._weighting = parseFloat(settings['arpa_w_' + project.id] ?? project._weighting);
        }
        ProjectManager.sortByPriority();

        for (let spell of Object.values(RitualManager.Productions)) {
            spell.weighting = parseFloat(settings['spell_w_' + spell.id] ?? spell.weighting);
        }

        for (let production of Object.values(FactoryManager.Productions)) {
            production.enabled = settings['production_' + production.resource.id] ?? production.enabled;
            production.weighting = parseFloat(settings['production_w_' + production.resource.id] ?? production.weighting);
            production.priority = parseFloat(settings['production_p_' + production.resource.id] ?? production.priority);
        }

        for (let fuel of Object.values(SmelterManager.Fuels)) {
            fuel.priority = parseInt(settings['smelter_fuel_p_' + fuel.id] ?? fuel.priority);
        }

        for (let production of Object.values(DroidManager.Productions)) {
            production.weighting = parseFloat(settings['droid_w_' + production.resource.id] ?? production.weighting);
            production.priority = parseFloat(settings['droid_pr_' + production.resource.id] ?? production.priority);
        }

        for (let resource of Object.values(resources)) {
            if (resource.isEjectable()) {
                resource.ejectEnabled = settings['res_eject' + resource.id] ?? resource.ejectEnabled;
            }
            if (resource.isSupply()) {
                resource.supplyEnabled = settings['res_supply' + resource.id] ?? resource.supplyEnabled;
            }
            if (resource.hasStorage()) {
                resource.autoStorageEnabled = settings['res_storage' + resource.id] ?? resource.autoStorageEnabled;
                resource.storeOverflow = settings['res_storage_o_' + resource.id] ?? resource.storeOverflow;
                resource.storagePriority = parseFloat(settings['res_storage_p_' + resource.id] ?? resource.storagePriority);
                resource._autoCratesMax = parseInt(settings['res_crates_m_' + resource.id] ?? resource._autoCratesMax);
                resource._autoContainersMax = parseInt(settings['res_containers_m_' + resource.id] ?? resource._autoContainersMax);
            }
            if (resource.isTradable()) {
                resource.marketPriority = parseInt(settings['res_buy_p_' + resource.id] ?? resource.marketPriority);
                resource.autoBuyEnabled = settings['buy' + resource.id] ?? resource.autoBuyEnabled;
                resource.autoBuyRatio = parseFloat(settings['res_buy_r_' + resource.id] ?? resource.autoBuyRatio);
                resource.autoSellEnabled = settings['sell' + resource.id] ?? resource.autoSellEnabled;
                resource.autoSellRatio = parseFloat(settings['res_sell_r_' + resource.id] ?? resource.autoSellRatio);
                resource.autoTradeBuyEnabled = settings['res_trade_buy_' + resource.id] ?? resource.autoTradeBuyEnabled;
                resource.autoTradeSellEnabled = settings['res_trade_sell_' + resource.id] ?? resource.autoTradeSellEnabled;
                resource.autoTradeWeighting = settings['res_trade_w_' + resource.id] ?? resource.autoTradeWeighting;
                resource.autoTradePriority = settings['res_trade_p_' + resource.id] ?? resource.autoTradePriority;
            }
        }
        StorageManager.sortByPriority();
        MarketManager.sortByPriority();

        for (let i = 0; i < poly.galaxyOffers.length; i++) {
            let resource = resources[poly.galaxyOffers[i].buy.res];
            resource.galaxyMarketWeighting = parseFloat(settings['res_galaxy_w_' + resource.id] ?? resource.galaxyMarketWeighting);
            resource.galaxyMarketPriority = parseFloat(settings['res_galaxy_p_' + resource.id] ?? resource.galaxyMarketPriority);
        }
    }

    function updateSettingsFromState() {
        updateStandAloneSettings();

        settings.triggers = JSON.parse(JSON.stringify(TriggerManager.priorityList));

        for (let i = 0; i < BuildingManager.priorityList.length; i++) {
            const building = BuildingManager.priorityList[i];
            settings['bat' + building._vueBinding] = building.autoBuildEnabled;
            settings['bld_p_' + building._vueBinding] = building.priority;
            settings['bld_m_' + building._vueBinding] = building._autoMax;
            settings['bld_w_' + building._vueBinding] = building._weighting;
            if (building.isSwitchable()) {
                settings['bld_s_' + building._vueBinding] = building.autoStateEnabled;
            }
            if (building.is.smart) {
                settings['bld_s2_' + building._vueBinding] = building.autoStateSmart;
            }
        }

        for (let i = 0; i < state.craftableResourceList.length; i++) {
            const resource = state.craftableResourceList[i];
            settings['craft' + resource.id] = resource.autoCraftEnabled;
            settings["foundry_w_" + resource.id] = resource.craftWeighting;
            settings["foundry_p_" + resource.id] = resource.craftPreserve;
        }

        for (let i = 0; i < JobManager.priorityList.length; i++) {
            const job = JobManager.priorityList[i];
            settings['job_' + job._originalId] = job.autoJobEnabled;
            settings['job_p_' + job._originalId] = job.priority;
            settings['job_b1_' + job._originalId] = job.breakpoints[0];
            settings['job_b2_' + job._originalId] = job.breakpoints[1];
            settings['job_b3_' + job._originalId] = job.breakpoints[2];
        }

        for (let i = 0; i < MinorTraitManager.priorityList.length; i++) {
            const trait = MinorTraitManager.priorityList[i];
            settings['mTrait_' + trait.traitName] = trait.enabled;
            settings['mTrait_w_' + trait.traitName] = trait.weighting;
            settings['mTrait_p_' + trait.traitName] = trait.priority;
        }

        settings.arpa = settings.arpa ?? {};
        for (let i = 0; i < ProjectManager.priorityList.length; i++) {
            const project = ProjectManager.priorityList[i];
            settings.arpa[project.id] = project.autoBuildEnabled;
            settings['arpa_p_' + project.id] = project.priority;
            settings['arpa_m_' + project.id] = project._autoMax;
            settings['arpa_w_' + project.id] = project._weighting;
        }

        for (let spell of Object.values(RitualManager.Productions)) {
            settings['spell_w_' + spell.id] = spell.weighting;
        }

        for (let production of Object.values(FactoryManager.Productions)) {
            settings["production_" + production.resource.id] = production.enabled;
            settings["production_w_" + production.resource.id] = production.weighting;
            settings["production_p_" + production.resource.id] = production.priority;
        }

        for (let fuel of Object.values(SmelterManager.Fuels)) {
            settings["smelter_fuel_p_" + fuel.id] = fuel.priority;
        }

        for (let production of Object.values(DroidManager.Productions)) {
            settings["droid_w_" + production.resource.id] = production.weighting;
            settings["droid_pr_" + production.resource.id] = production.priority;
        }

        for (let resource of Object.values(resources)) {
            if (resource.isEjectable()) {
                settings['res_eject' + resource.id] = resource.ejectEnabled;
            }
            if (resource.isSupply()) {
                settings['res_supply' + resource.id] = resource.supplyEnabled;
            }
            if (resource.hasStorage()) {
                settings['res_storage' + resource.id] = resource.autoStorageEnabled;
                settings['res_storage_o_' + resource.id] = resource.storeOverflow;
                settings['res_storage_p_' + resource.id] = resource.storagePriority;
                settings['res_crates_m_' + resource.id] = resource._autoCratesMax;
                settings['res_containers_m_' + resource.id] = resource._autoContainersMax;
            }
            if (resource.isTradable()) {
                settings['res_buy_p_' + resource.id] = resource.marketPriority;
                settings['buy' + resource.id] = resource.autoBuyEnabled;
                settings['res_buy_r_' + resource.id] = resource.autoBuyRatio;
                settings['sell' + resource.id] = resource.autoSellEnabled;
                settings['res_sell_r_' + resource.id] = resource.autoSellRatio;
                settings['res_trade_buy_' + resource.id] = resource.autoTradeBuyEnabled;
                settings['res_trade_sell_' + resource.id] = resource.autoTradeSellEnabled;
                settings['res_trade_w_' + resource.id] = resource.autoTradeWeighting;
                settings['res_trade_p_' + resource.id] = resource.autoTradePriority;
            }
        }

        for (let i = 0; i < poly.galaxyOffers.length; i++) {
            let resource = resources[poly.galaxyOffers[i].buy.res];
            settings['res_galaxy_w_' + resource.id] = resource.galaxyMarketWeighting;
            settings['res_galaxy_p_' + resource.id] = resource.galaxyMarketPriority;
        }

        localStorage.setItem('settings', JSON.stringify(settings));
    }

    function addSetting(settingName, defaultValue) {
        if (!settings.hasOwnProperty(settingName)) {
            settings[settingName] = defaultValue;
        }
    }

    function updateStandAloneSettings() {
        settings['scriptName'] = "TMVictor";

        addSetting("triggers", []);
        addSetting("evolutionQueue", []);
        addSetting("evolutionQueueEnabled", false);
        addSetting("evolutionQueueRepeat", false);

        addSetting("storageLimitPreMad", true);
        addSetting("storageSafeReassign", true);
        addSetting("storageAssignExtra", true);
        addSetting("storagePrioritizedOnly", false);
        addSetting("arpaScaleWeighting", true);
        addSetting("arpaStep", 10);

        addSetting("productionChrysotileWeight", 2);
        addSetting("productionFoundryWeighting", "demanded");
        addSetting("productionRitualManaUse", 0.5);
        addSetting("productionSmelting", "storage");
        addSetting("productionFactoryMinIngredients", 0.01);

        addSetting("jobSetDefault", true);
        addSetting("jobLumberWeighting", 50);
        addSetting("jobQuarryWeighting", 50);
        addSetting("jobCrystalWeighting", 50);
        addSetting("jobScavengerWeighting", 50);
        addSetting("jobDisableMiners", true);
        addSetting("jobDisableCraftsmans", true);

        addSetting("masterScriptToggle", true);
        addSetting("showSettings", true);
        addSetting("autoEvolution", false);
        addSetting("autoMarket", false);
        addSetting("autoFight", false);
        addSetting("autoCraft", false);
        addSetting("autoARPA", false);
        addSetting("autoBuild", false);
        addSetting("autoResearch", false);
        addSetting("autoJobs", false);
        addSetting("autoTax", false);
        addSetting("autoCraftsmen", false);
        addSetting("autoPower", false);
        addSetting("autoStorage", false);
        addSetting("autoMinorTrait", false);
        addSetting("autoHell", false);
        addSetting("autoMech", false);
        addSetting("autoFleet", false);
        addSetting("autoSupply", false);
        addSetting("autoGalaxyMarket", false);

        addSetting("logEnabled", true);
        addSetting(GameLog.Types.arpa.settingKey, false);
        Object.values(GameLog.Types).forEach(log => addSetting(log.settingKey, true));
        addSetting("logFilter", "");

        addSetting("autoPylon", false);
        addSetting("autoQuarry", false);
        addSetting("autoSmelter", false);
        addSetting("autoFactory", false);
        addSetting("autoMiningDroid", false);
        addSetting("autoGraphenePlant", false);
        addSetting("prestigeType", "none");
        addSetting("prestigeMADIgnoreArpa", true);
        addSetting("prestigeMADWait", true);
        addSetting("prestigeMADPopulation", 1);
        addSetting("prestigeWaitAT", true);
        addSetting("buildPopulation", false);
        addSetting("prestigeBioseedConstruct", true);
        addSetting("prestigeEnabledBarracks", 100);
        addSetting("prestigeBioseedProbes", 3);
        addSetting("prestigeWhiteholeSaveGems", false);
        addSetting("prestigeWhiteholeMinMass", 8);
        addSetting("prestigeWhiteholeStabiliseMass", true);
        addSetting("prestigeWhiteholeEjectEnabled", true);
        addSetting("prestigeWhiteholeEjectExcess", false);
        addSetting("prestigeWhiteholeDecayRate", 0.2);
        addSetting("prestigeWhiteholeEjectAllCount", 100);
        addSetting("prestigeAscensionSkipCustom", false);
        addSetting("prestigeAscensionPillar", true);
        addSetting("prestigeDemonicFloor", 100);
        addSetting("prestigeDemonicPotential", 0.4);
        addSetting("prestigeDemonicBomb", false);

        addSetting("autoAssembleGene", false);
        addSetting("genesAssembleGeneAlways", true);

        addSetting("minimumMoney", 0);
        addSetting("minimumMoneyPercentage", 0);
        addSetting("tradeRouteMinimumMoneyPerSecond", 500);
        addSetting("tradeRouteMinimumMoneyPercentage", 50);
        addSetting("tradeRouteSellExcess", true);
        addSetting("generalMinimumTaxRate", 20);
        addSetting("generalMinimumMorale", 105);
        addSetting("generalMaximumMorale", 500);
        addSetting("govManage", false);
        addSetting("govInterim", GovernmentManager.Types.democracy.id);
        addSetting("govFinal", GovernmentManager.Types.technocracy.id);
        addSetting("govSpace", GovernmentManager.Types.corpocracy.id);
        addSetting("govGovernor", "none");

        addSetting("foreignAttackLivingSoldiersPercent", 90);
        addSetting("foreignAttackHealthySoldiersPercent", 90);
        addSetting("foreignHireMercMoneyStoragePercent", 90);
        addSetting("foreignHireMercCostLowerThanIncome", 1);
        addSetting("foreignHireMercDeadSoldiers", 1);
        addSetting("foreignMinAdvantage", 40);
        addSetting("foreignMaxAdvantage", 50);
        addSetting("foreignMaxSiegeBattalion", 10);
        addSetting("foreignProtectSoldiers", false);

        addSetting("foreignPacifist", false);
        addSetting("foreignUnification", true);
        addSetting("foreignForceSabotage", true);
        addSetting("foreignOccupyLast", true);
        addSetting("foreignTrainSpy", true);
        addSetting("foreignSpyMax", 2);
        addSetting("foreignPowerRequired", 75);
        addSetting("foreignPolicyInferior", "Annex");
        addSetting("foreignPolicySuperior", "Sabotage");
        addSetting("foreignPolicyRival", "Sabotage");

        addSetting("disableHell", false)
        addSetting("maxSoulGems", 0)
        addSetting("hellTurnOffLogMessages", true);
        addSetting("hellHandlePatrolCount", true);
        addSetting("hellHomeGarrison", 10);
        addSetting("hellMinSoldiers", 20);
        addSetting("hellMinSoldiersPercent", 90);

        addSetting("hellTargetFortressDamage", 100);
        addSetting("hellLowWallsMulti", 3);

        addSetting("hellHandlePatrolSize", true);
        addSetting("hellPatrolMinRating", 30);
        addSetting("hellPatrolThreatPercent", 8);
        addSetting("hellPatrolDroneMod", 5);
        addSetting("hellPatrolDroidMod", 5);
        addSetting("hellPatrolBootcampMod", 0);
        addSetting("hellBolsterPatrolPercentTop", 50);
        addSetting("hellBolsterPatrolPercentBottom", 20);
        addSetting("hellBolsterPatrolRating", 300);

        addSetting("hellAttractorTopThreat", 3000);
        addSetting("hellAttractorBottomThreat", 1300);

        addSetting("userUniverseTargetName", "none");
        addSetting("userPlanetTargetName", "none");
        addSetting("userEvolutionTarget", "auto");

        for (let i = 0; i < challenges.length; i++) {
            addSetting("challenge_" + challenges[i][0].id, false)
        }

        addSetting("userResearchTheology_1", "auto");
        addSetting("userResearchTheology_2", "auto");
        addSetting("researchIgnore", ["tech-purify"]);

        addSetting("buildingBuildIfStorageFull", false);
        addSetting("buildingsIgnoreZeroRate", false);
        addSetting("buildingsConflictQueue", true);
        addSetting("buildingsConflictRQueue", true);
        addSetting("buildingsConflictPQueue", true);
        addSetting("buildingShrineType", "know");
        addSetting("buildingTowerSuppression", 100);
        addSetting("buildingAlwaysClick", false);
        addSetting("buildingClickPerTick", 50);
        addSetting("buildingWeightingNew", 3);
        addSetting("buildingWeightingUselessPowerPlant", 0.01);
        addSetting("buildingWeightingNeedfulPowerPlant", 3);
        addSetting("buildingWeightingUnderpowered", 0.8);
        addSetting("buildingWeightingUselessKnowledge", 0.01);
        addSetting("buildingWeightingNeedfulKnowledge", 5);
        addSetting("buildingWeightingMissingFuel", 10);
        addSetting("buildingWeightingNonOperatingCity", 0.2);
        addSetting("buildingWeightingNonOperating", 0);
        addSetting("buildingWeightingMissingSupply", 0);
        addSetting("buildingWeightingMissingSupport", 0);
        addSetting("buildingWeightingUselessSupport", 0.01);
        addSetting("buildingWeightingMADUseless", 0);
        addSetting("buildingWeightingUnusedEjectors", 0.1);
        addSetting("buildingWeightingCrateUseless", 0.01);
        addSetting("buildingWeightingHorseshoeUseless", 0.01);
        addSetting("buildingWeightingZenUseless", 0.01);
        addSetting("buildingWeightingGateTurret", 0.01);
        addSetting("buildingWeightingNeedStorage", 1);

        addSetting("buildingEnabledAll", true);
        addSetting("buildingStateAll", true);

        addSetting("triggerRequest", true);
        addSetting("queueRequest", true);
        addSetting("researchRequest", true);
        addSetting("researchRequestSpace", false);
        addSetting("missionRequest", true);

        settingsSections.forEach(id => addSetting(id + "SettingsCollapsed", true));
        galaxyRegions.forEach((id, index) => addSetting("fleet_pr_" + id, index));

        addSetting("fleetMaxCover", true);
        addSetting("fleetEmbassyKnowledge", 6000000);
        addSetting("fleetAlienGiftKnowledge", 6500000);
        addSetting("fleetAlien2Knowledge", 9000000);
        addSetting("fleetChthonianLoses", "frigate");

        addSetting("mechScrap", "mixed");
        addSetting("mechScrapEfficiency", 2);
        addSetting("mechBuild", "random");
        addSetting("mechSize", "titan");
        addSetting("mechSizeGravity", "auto");
        addSetting("mechFillBay", true);
        addSetting("mechScouts", 0.05);
        addSetting("mechMinSupply", 1000);
        addSetting("mechMaxCollectors", 0.5);
        addSetting("mechSpecial", "prefered");
        addSetting("mechSaveSupply", true);
        addSetting("buildingMechsFirst", true);
        addSetting("mechBaysFirst", true);
        addSetting("mechWaygatePotential", 0.4);

        biomeList.forEach(biome => addSetting("biome_w_" + biome, (planetBiomes.length - planetBiomes.indexOf(biome)) * 10));
        traitList.forEach(trait => addSetting("trait_w_" + trait, (planetTraits.length - planetTraits.indexOf(trait)) * 10));
        addSetting("extra_w_Achievement", 1000);
        extraList.forEach(extra => addSetting("extra_w_" + extra, 0));

        // Convert old setings
        settings.triggers.forEach(t => {
            if (techIds["tech-" + t.actionId]) { t.actionId = "tech-" + t.actionId; }
            if (techIds["tech-" + t.requirementId]) { t.requirementId = "tech-" + t.requirementId; }
        });
        if (settings.hasOwnProperty("productionPrioritizeDemanded")) {
            settings.productionFoundryWeighting = settings.productionPrioritizeDemanded ? "demanded" : "none";
        }
        settings.challenge_plasmid = settings.challenge_mastery || settings.challenge_plasmid; // Merge challenge settings
        // Remove old settings
        ["buildingWeightingTriggerConflict", "researchAlienGift", "arpaBuildIfStorageFullCraftableMin", "arpaBuildIfStorageFullResourceMaxPercent", "arpaBuildIfStorageFull", "productionMoneyIfOnly", "autoAchievements", "autoChallenge", "autoMAD", "autoSpace", "autoSeeder", "foreignSpyManage", "foreignHireMercCostLowerThan", "userResearchUnification", "btl_Ambush", "btl_max_Ambush", "btl_Raid", "btl_max_Raid", "btl_Pillage", "btl_max_Pillage", "btl_Assault", "btl_max_Assault", "btl_Siege", "btl_max_Siege", "smelter_fuel_Oil", "smelter_fuel_Coal", "smelter_fuel_Lumber", "planetSettingsCollapser", "buildingManageSpire", "hellHandleAttractors", "researchFilter", "challenge_mastery", "hellCountGems", "productionPrioritizeDemanded", "fleetChthonianPower", "productionWaitMana"].forEach(id => delete settings[id]);
        ["foreignAttack", "foreignOccupy", "foreignSpy", "foreignSpyMax", "foreignSpyOp"].forEach(id => [0, 1, 2].forEach(index => delete settings[id + index]));
        ["res_storage_w_", "res_trade_buy_mtr_", "res_trade_sell_mps_"].forEach(id => Object.values(resources).forEach(resource => delete settings[id + resource.id]));
        Object.values(projects).forEach(project => delete settings['arpa_ignore_money_' + project.id]);
        Object.values(buildings).filter(building => !building.isSwitchable()).forEach(building => delete settings['bld_s_' + building._vueBinding]);
    }

    function getAchievementLevel(context) {
        let a_level = 1;
        if (context.challenge_plasmid) { a_level++; }
        if (context.challenge_trade) { a_level++; }
        if (context.challenge_craft) { a_level++; }
        if (context.challenge_crispr) { a_level++; }
        return a_level;
    }

    function isAchievementUnlocked(id, level) {
        let universe = "l";
        switch (game.global.race.universe){
            case 'antimatter':
                universe = "a";
                break;
            case 'heavy':
                universe = "h";
                break;
            case 'evil':
                universe = "e";
                break;
            case 'micro':
                universe = "m";
                break;
            case 'magic':
                universe = "mg";
                break;
        }
        return game.global.stats.achieve[id] && game.global.stats.achieve[id][universe] && game.global.stats.achieve[id][universe] >= level;
    }

    function loadQueuedSettings() {
        if (settings.evolutionQueueEnabled && settings.evolutionQueue.length > 0) {
            state.evolutionAttempts++;
            let queuedEvolution = settings.evolutionQueue.shift();
            for (let [settingName, settingValue] of Object.entries(queuedEvolution)) {
                if (typeof settings[settingName] === typeof settingValue) {
                    settings[settingName] = settingValue;
                } else {
                    console.log(`Type mismatch during loading queued settings: settings.${settingName} type: ${typeof settings[settingName]}, value: ${settings[settingName]}; queuedEvolution.${settingName} type: ${typeof settingValue}, value: ${settingValue};`);
                }
            }
            if (settings.evolutionQueueRepeat) {
                settings.evolutionQueue.push(queuedEvolution);
            }
            updateStateFromSettings();
            updateSettingsFromState();
            if (settings.showSettings) {
                removeScriptSettings();
                buildScriptSettings();
            }
        }
    }

    function autoEvolution() {
        if (game.global.race.species !== "protoplasm") {
            return;
        }

        autoUniverseSelection();
        autoPlanetSelection();

        // Wait for universe and planet, we don't want to run auto achievement until we'll land somewhere
        if (game.global.race.universe === 'bigbang' || (game.global.race.seeded && !game.global.race['chose'])) {
            return;
        }

        if (state.evolutionTarget === null) {
            loadQueuedSettings();

            // Try to pick race for achievement first
            if (settings.userEvolutionTarget === "auto") {
                // Determine star level based on selected challenges and use it to check if achievements for that level have been... achieved
                let achievementLevel = getAchievementLevel(settings);
                let targetedGroup = {race: null, remainingPercent: 0};

                let genusGroups = {};
                for (let id in races) {
                    let race = races[id];
                    if (race.getHabitability() > 0) {
                        genusGroups[race.genus] = genusGroups[race.genus] ?? [];
                        genusGroups[race.genus].push(race);
                    }
                }

                for (let raceGroup of Object.values(genusGroups)) {
                    let remainingAchievements = 0;
                    let remainingRace = null;

                    for (let j = 0; j < raceGroup.length; j++) {
                        let race = raceGroup[j];

                        // Ignore Valdi if we're not going for 4star MAD
                        if (race === races.junker && (achievementLevel < 5 || settings.prestigeType === 'bioseed')) {
                            continue;
                        }

                        // We're going to check pillars for ascension and infusion, greatness achievement for bioseeding, or extinction achievement otherwise
                        let raceIsGood = false;
                        if (settings.prestigeType === "ascension" || settings.prestigeType === "demonic") {
                            raceIsGood = !race.isPillarUnlocked(achievementLevel);
                        } else if (settings.prestigeType === "bioseed") {
                            raceIsGood = !race.isGreatnessAchievementUnlocked(achievementLevel);
                        } else {
                            raceIsGood = !race.isMadAchievementUnlocked(achievementLevel);
                        }

                        if (raceIsGood) {
                            remainingRace = race;
                            remainingAchievements++;
                        }
                    }
                    if (!remainingRace) {
                        continue;
                    }
                    let raceSuited = remainingRace.getHabitability();

                    // We'll target the group with the highest percentage chance of getting an achievement
                    let remainingPercent = remainingAchievements / raceGroup.length;

                    // If we have Mass Extinction perk, and not affected by randomness - prioritize suited conditional races
                    if (remainingRace !== races.junker && game.global.stats.achieve['mass_extinction'] && remainingRace.getCondition() !== '' && raceSuited === 1) {
                        targetedGroup.race = remainingRace;
                        targetedGroup.remainingPercent = 100;
                    }

                    // Deprioritize unsuited
                    if (raceSuited < 1) {
                        remainingPercent /= 100;
                    }

                    // If this group has the most races left with remaining achievements then target an uncompleted race in this group
                    if (remainingPercent > targetedGroup.remainingPercent) {
                        targetedGroup.race = remainingRace;
                        targetedGroup.remainingPercent = remainingPercent;
                    }
                }
                state.evolutionTarget = targetedGroup.race;
            }

            // Auto Achievements disabled, checking user specified race
            if (settings.userEvolutionTarget !== "auto") {
                let userRace = races[settings.userEvolutionTarget];
                if (userRace && userRace.getHabitability() > 0){
                    // Race specified, and condition is met
                    state.evolutionTarget = userRace
                }
            }

            // Try to pull next race from queue
            if (state.evolutionTarget === null && settings.evolutionQueueEnabled && settings.evolutionQueue.length > 0 && (!settings.evolutionQueueRepeat || state.evolutionAttempts < settings.evolutionQueue.length)) {
                return;
            }

            // Still no target. Fallback to antid.
            if (state.evolutionTarget === null) {
                state.evolutionTarget = races.antid;
            }
            GameLog.logSuccess(GameLog.Types.special, `Attempting evolution of ${state.evolutionTarget.name}.`);
        }

        // Apply challenges
        for (let i = 0; i < challenges.length; i++) {
            if (settings["challenge_" + challenges[i][0].id]) {
                for (let j = 0; j < challenges[i].length; j++) {
                    let {id, trait} = challenges[i][j];
                    if (game.global.race[trait] !== 1 && evolutions[id].click() && id === "junker") {
                        return; // Give game time to update state after activating junker
                    }
                }
            }
        }

        // Calculate the maximum RNA and DNA required to evolve and don't build more than that
        let maxRNA = 0;
        let maxDNA = 0;

        for (let i = 0; i < state.evolutionTarget.evolutionTree.length; i++) {
            const evolution = state.evolutionTarget.evolutionTree[i];
            const costs = evolution.definition.cost;

            if (costs["RNA"]) {
                let rnaCost = poly.adjustCosts(Number(evolution.definition.cost["RNA"]()) || 0);
                maxRNA = Math.max(maxRNA, rnaCost);
            }

            if (costs["DNA"]) {
                let dnaCost = poly.adjustCosts(Number(evolution.definition.cost["DNA"]()) || 0);
                maxDNA = Math.max(maxDNA, dnaCost);
            }
        }

        // Gather some resources and evolve
        let DNAForEvolution = Math.min(maxDNA - resources.DNA.currentQuantity, resources.DNA.maxQuantity - resources.DNA.currentQuantity, resources.RNA.maxQuantity / 2);
        let RNAForDNA = Math.min(DNAForEvolution * 2 - resources.RNA.currentQuantity, resources.RNA.maxQuantity - resources.RNA.currentQuantity);
        let RNARemaining = resources.RNA.currentQuantity + RNAForDNA - DNAForEvolution * 2;
        let RNAForEvolution = Math.min(maxRNA - RNARemaining, resources.RNA.maxQuantity - RNARemaining);

        let rna = game.actions.evolution.rna;
        let dna = game.actions.evolution.dna;
        for (let i = 0; i < RNAForDNA; i++) { rna.action(); }
        for (let i = 0; i < DNAForEvolution; i++) { dna.action(); }
        for (let i = 0; i < RNAForEvolution; i++) { rna.action(); }

        resources.RNA.currentQuantity = RNARemaining + RNAForEvolution;
        resources.DNA.currentQuantity = resources.DNA.currentQuantity + DNAForEvolution;

        // Lets go for our targeted evolution
        for (let i = 0; i < state.evolutionTarget.evolutionTree.length; i++) {
            let action = state.evolutionTarget.evolutionTree[i];
            if (action.isUnlocked()) {
                // Don't click challenges which already active
                let challenge = challenges.flat().find(c => c.id === action.id);
                if (challenge && game.global.race[challenge.trait]) {
                    continue;
                }
                if (action.click()) {
                    // If we successfully click the action then return to give the ui some time to refresh
                    return;
                } else {
                    // Our path is unlocked but we can't click it yet
                    break;
                }
            }
        }

        if (evolutions.mitochondria.count < 1 || resources.RNA.maxQuantity < maxRNA || resources.DNA.maxQuantity < maxDNA) {
            evolutions.mitochondria.click();
        }
        if (evolutions.eukaryotic_cell.count < 1 || resources.DNA.maxQuantity < maxDNA) {
            evolutions.eukaryotic_cell.click();
        }
        if (resources.RNA.maxQuantity < maxRNA) {
            evolutions.membrane.click();
        }
        if (evolutions.nucleus.count < 10) {
            evolutions.nucleus.click();
        }
        if (evolutions.organelles.count < 10) {
            evolutions.organelles.click();
        }
    }

    function autoUniverseSelection() {
        if (!game.global.race['bigbang']) { return; }
        if (game.global.race.universe !== 'bigbang') { return; }
        if (settings.userUniverseTargetName === 'none') { return; }

        var action = document.getElementById(`uni-${settings.userUniverseTargetName}`);

        if (action !== null) {
            logClick(action.children[0], `Select universe: ${settings.userUniverseTargetName}`);
        }
    }

    // function setPlanet from actions.js
    // Produces same set of planets, accurate for v1.0.29
    function generatePlanets() {
        let seed = game.global.race.seed;
        let seededRandom = function(min = 0, max = 1) {
            seed = (seed * 9301 + 49297) % 233280;
            let rnd = seed / 233280;
            return min + rnd * (max - min);
        }

        let biomes = ['grassland', 'oceanic', 'forest', 'desert', 'volcanic', 'tundra', game.global.race.universe === 'evil' ? 'eden' : 'hellscape'];
        let traits = ['toxic', 'mellow', 'rage', 'stormy', 'ozone', 'magnetic', 'trashed', 'elliptical', 'flare', 'dense', 'unstable', 'none', 'none', 'none', 'none', 'none'];
        let geologys = ['Copper', 'Iron', 'Aluminium', 'Coal', 'Oil', 'Titanium', 'Uranium'];
        if (game.global.stats.achieve['whitehole']) {
            geologys.push('Iridium');
        }

        let planets = [];
        let hell = false;
        let maxPlanets = Math.max(1, game.global.race.probes);
        for (let i = 0; i < maxPlanets; i++){
            let planet = {geology: {}};
            let max_bound = !hell && game.global.stats.portals >= 1 ? 7 : 6;
            planet.biome = biomes[Math.floor(seededRandom(0, max_bound))];
            planet.trait = traits[Math.floor(seededRandom(0, 16))];

            let max = Math.floor(seededRandom(0,3));
            let top = planet.biome === 'eden' ? 35 : 30;
            if (game.global.stats.achieve['whitehole']){
                max += game.global.stats.achieve['whitehole'].l;
                top += game.global.stats.achieve['whitehole'].l * 5;
            }

            for (let i = 0; i < max; i++){
                let index = Math.floor(seededRandom(0, 10));
                if (geologys[index]) {
                    planet.geology[geologys[index]] = ((Math.floor(seededRandom(0, top)) - 10) / 100);
                }
            }

            let id = planet.biome + Math.floor(seededRandom(0,10000));
            planet.id = id.charAt(0).toUpperCase() + id.slice(1);

            if (planet.biome !== 'hellscape' && planet.biome !== 'eden') {
                seededRandom(); // We don't need orbit. Call it just to sync seed with game math.
            } else {
                hell = true;
            }
            planets.push(planet);
        }
        return planets;
    }

    function autoPlanetSelection() {
        if (game.global.race.universe === 'bigbang') { return; }
        if (!game.global.race.seeded || game.global.race['chose']) { return; }
        if (settings.userPlanetTargetName === 'none') { return; }

        let planets = generatePlanets();

        // Let's try to calculate how many achievements we can get here
        let alevel = getAchievementLevel(settings);
        for (let i = 0; i < planets.length; i++){
            let planet = planets[i];
            planet.achieve = 0;

            if (!isAchievementUnlocked("biome_" + planet.biome, alevel)) {
                planet.achieve++;
            }
            if (planet.trait !== "none" && !isAchievementUnlocked("atmo_" + planet.trait, alevel)) {
                planet.achieve++;
            }
            if (planetBiomeGenus[planet.biome]) {
                for (let id in races) {
                    if (races[id].genus === planetBiomeGenus[planet.biome] && !isAchievementUnlocked("extinct_" + id, alevel)) {
                        planet.achieve++;
                    }
                }
                // All races have same genus, no need to check both
                if (!isAchievementUnlocked("genus_" + planetBiomeGenus[planet.biome], alevel)) {
                    planet.achieve++;
                }
            }
        }

        // Now calculate weightings
        for (let i = 0; i < planets.length; i++){
            let planet = planets[i];
            planet.weighting = 0;

            planet.weighting += settings["biome_w_" + planet.biome];
            planet.weighting += settings["trait_w_" + planet.trait];

            planet.weighting += planet.achieve * settings["extra_w_Achievement"];

            let numShow = game.global.stats.achieve['miners_dream'] ? game.global.stats.achieve['miners_dream'].l >= 4 ? game.global.stats.achieve['miners_dream'].l * 2 - 3 : game.global.stats.achieve['miners_dream'].l : 0;
            for (let id in planet.geology) {
                if (planet.geology[id] === 0) {
                    continue;
                }
                if (numShow-- > 0) {
                    planet.weighting += (planet.geology[id] / 0.01) * settings["extra_w_" + id];
                } else {
                    planet.weighting += (planet.geology[id] > 0 ? 1 : -1) * settings["extra_w_" + id];
                }
            }
        }

        if (settings.userPlanetTargetName === "weighting") {
            planets.sort((a, b) => b.weighting - a.weighting);
        }

        if (settings.userPlanetTargetName === "habitable") {
            planets.sort((a, b) => (planetBiomes.indexOf(a.biome) + planetTraits.indexOf(a.trait)) -
                                   (planetBiomes.indexOf(b.biome) + planetTraits.indexOf(b.trait)));
        }

        if (settings.userPlanetTargetName === "achieve") {
            planets.sort((a, b) => a.achieve !== b.achieve ? b.achieve - a.achieve :
                                   (planetBiomes.indexOf(a.biome) + planetTraits.indexOf(a.trait)) -
                                   (planetBiomes.indexOf(b.biome) + planetTraits.indexOf(b.trait)));
        }

        let selectedPlanet = document.getElementById(planets[0].id);
        if (selectedPlanet) {
            logClick(selectedPlanet.children[0], "select planet");
        }
    }

    function autoCraft() {
        if (!resources.Population.isUnlocked()) { return; }
        if (game.global.race['no_craft']) { return; }

        craftLoop:
        for (let i = 0; i < state.craftableResourceList.length; i++) {
            let craftable = state.craftableResourceList[i];
            if (!craftable.isUnlocked() || !craftable.autoCraftEnabled || craftable === resources.Scarletite) {
                continue;
            }

            let afforableAmount = Number.MAX_SAFE_INTEGER;
            for (let j = 0; j < craftable.resourceRequirements.length; j++) {
                let requirement = craftable.resourceRequirements[j];
                let resource = requirement.resource;

                if (craftable.isDemanded()) { // Craftable demanded, get as much as we can
                    afforableAmount = Math.min(afforableAmount, resource.currentQuantity / requirement.quantity);
                } else if (resource.isDemanded() || resource.usefulRatio < craftable.usefulRatio) { // Don't use demanded resources
                    continue craftLoop;
                } else if (craftable.currentQuantity > craftable.storageRequired * 100 && (resource.storageRatio < 0.99 || resource.calculateRateOfChange({all: true}) <= 0)) { // 100x craftables, try to save up resources
                    continue craftLoop;
                } else if (craftable.currentQuantity < craftable.storageRequired) { // Craftable is required, use all spare resources
                    afforableAmount = Math.min(afforableAmount, resource.spareQuantity / requirement.quantity);
                } else if (resource.currentQuantity > resource.storageRequired || resource.isCapped()) { // Resource not required - consume last 10%
                    afforableAmount = Math.min(afforableAmount, ((resource.storageRatio - 0.9) * resource.maxQuantity));
                } else { // Resource is required, and craftable not required. Don't craft anything.
                    continue craftLoop;
                }
            }
            afforableAmount = Math.floor(afforableAmount);
            if (afforableAmount >= 1) {
                craftable.tryCraftX(afforableAmount);
                for (let j = 0; j < craftable.resourceRequirements.length; j++) {
                    let requirement = craftable.resourceRequirements[j];
                    requirement.resource.currentQuantity -= requirement.quantity * afforableAmount;
                }
            }
        }
    }

    function manageGovernment() {
        // Change government
        if (GovernmentManager.isEnabled()) {
            if (haveTech("q_factory") && GovernmentManager.Types[settings.govSpace].isUnlocked()) {
                GovernmentManager.setGovernment(settings.govSpace);
            } else if (GovernmentManager.Types[settings.govFinal].isUnlocked()) {
                GovernmentManager.setGovernment(settings.govFinal);
            } else if (GovernmentManager.Types[settings.govInterim].isUnlocked()) {
                GovernmentManager.setGovernment(settings.govInterim);
            }
        }

        // Appoint governor
        if (haveTech("governor") && settings.govGovernor !== "none" && getGovernor() === "") {
            let candidates = game.global.race.governor?.candidates ?? [];
            for (let i = 0; i < candidates.length; i++) {
                if (candidates[i].bg === settings.govGovernor) {
                    getVueById("candidates")?.appoint(i);
                    break;
                }
            }
        }
    }

    function autoFight() {
        let garrisonAvailable = WarManager.initGarrison();
        let foreignAvailable = WarManager.isForeignUnlocked();
        let foreigns = null;

        if (garrisonAvailable) {
            autoMerc();
        }
        if (foreignAvailable) {
            foreigns = updateForeigns();
            autoSpy(foreigns); // Can unoccupy foreign power in rare occasions, without caching back new status, but such desync should not cause any harm
        }
        if (garrisonAvailable && foreignAvailable) {
            autoBattle(foreigns); // Invalidates garrison, and adds unaccounted amount of resources after attack
            if (game.global.race['rage']) {
                /*for (let i = 0; i < 10; i++) {
                    game.updateDebugData();
                    WarManager.updateData();
                    autoBattle(updateForeigns());
                }*/

                let i = 0;
                game.updateDebugData();
                WarManager.updateData();
                while (i++ < 10 && autoBattle(updateForeigns())) {
                    game.updateDebugData();
                    WarManager.updateData();
                }
            }
        }
    }

    function updateForeigns() {
        let activeForeigns = [];
        let controlledForeigns = 0;

        let unlockedForeigns = !haveTech("rival") ? [0, 1, 2] : [3];
        let inferiorTarget = null;
        let currentTarget = null;

        unlockedForeigns.forEach(i => {
            let foreign = {id: i, gov: game.global.civic.foreign[`gov${i}`]};
            activeForeigns.push(foreign);

            let rank = "";
            if (i === 3) {
                rank = "Rival";
            } else if (getGovPower(i) <= settings.foreignPowerRequired) {
                rank = "Inferior";
            } else {
                rank = "Superior";
            }
            foreign.policy = settings[`foreignPolicy${rank}`];

            if ((foreign.gov.anx && foreign.policy === "Annex") ||
                (foreign.gov.buy && foreign.policy === "Purchase") ||
                (foreign.gov.occ && foreign.policy === "Occupy")) {
                controlledForeigns++;
            }

            if (!foreign.gov.anx && !foreign.gov.buy && rank === "Inferior") {
                inferiorTarget = foreign;
            }
        });

        if (!settings.foreignPacifist) {
            // Try to attacks last uncontrolled inferior, or first occupied, or just first, in this order.
            currentTarget = inferiorTarget ?? activeForeigns.find(f => f.gov.occ) ?? activeForeigns[0];

            let readyToUnify = settings.foreignUnification && controlledForeigns >= 2 && game.global.tech['unify'] === 1;

            // Don't annex or purchase our farm target, unless we're ready to unify
            if (!readyToUnify && ["Annex", "Purchase"].includes(currentTarget.policy) && SpyManager.isEspionageUseful(currentTarget.id, SpyManager.Types[currentTarget.policy].id)) {
                currentTarget.policy = "Ignore";
            }
            // Force sabotage, if needed, and we know it's useful
            if (settings.foreignForceSabotage && SpyManager.isEspionageUseful(currentTarget.id, SpyManager.Types.Sabotage.id)) {
                currentTarget.policy = "Sabotage";
            }

            // Set last foreign to sabotage only, and then switch to occupy once we're ready to unify
            if (settings.foreignOccupyLast && !haveTech('world_control')) {
                let lastTarget = ["Occupy", "Sabotage"].includes(settings.foreignPolicySuperior) ? Math.max(...unlockedForeigns) : currentTarget.id;
                activeForeigns.find(foreign => foreign.id === lastTarget).policy = readyToUnify ? "Occupy" : "Sabotage";
            }

            // Do not attack if policy set to influence, or we're ready to unify
            if (currentTarget.policy === "Influence" || (readyToUnify && currentTarget.policy !== "Occupy")) {
                currentTarget = null;
            }
        }

        return [activeForeigns, currentTarget];
    }

    function autoMerc() {
        let m = WarManager;
        if (!m.isMercenaryUnlocked() || m.maxCityGarrison <= 0) {
            return;
        }

        if (!haveTask("merc")) {
            let mercenaryCost = m.getMercenaryCost();
            let mercenariesHired = 0;
            let mercenaryMax = m.maxSoldiers - settings.foreignHireMercDeadSoldiers;
            let maxCost = state.moneyMedian * settings.foreignHireMercCostLowerThanIncome;
            let minMoney = Math.max(resources.Money.maxQuantity * settings.foreignHireMercMoneyStoragePercent / 100, Math.min(resources.Money.maxQuantity - maxCost, (settings.storageAssignExtra ? resources.Money.storageRequired / 1.03 : resources.Money.storageRequired)));
            if (state.goal === "Reset") { // Get as much as possible before reset
                mercenaryMax = m.maxSoldiers;
                minMoney = 0;
                maxCost = Number.MAX_SAFE_INTEGER;
            }
            while (m.currentSoldiers < mercenaryMax && resources.Money.spareQuantity >= mercenaryCost &&
                  (resources.Money.currentQuantity - mercenaryCost > minMoney || mercenaryCost < maxCost) &&
                m.hireMercenary()) {
                mercenariesHired++;
                mercenaryCost = m.getMercenaryCost();
            }

            // Log the interaction
            if (mercenariesHired === 1) {
                GameLog.logSuccess(GameLog.Types.mercenary, `Hired a mercenary to join the garrison.`);
            } else if (mercenariesHired > 1) {
                GameLog.logSuccess(GameLog.Types.mercenary, `Hired ${mercenariesHired} mercenaries to join the garrison.`);
            }
        }
    }

    function autoSpy([activeForeigns, currentTarget]) {
        if (haveTask("spyop") || !haveTech("spy")) {
            return;
        }

        // Train spies
        if (settings.foreignTrainSpy) {
            let foreignVue = getVueById("foreign");
            for (let i = 0; i < activeForeigns.length; i++) {
                let foreign = activeForeigns[i];
                // Spy already in training, or can't be afforded, or foreign is under control
                if (foreignVue.spy_disabled(foreign.id) || foreign.gov.occ || foreign.gov.anx || foreign.gov.buy) {
                    continue;
                }

                let spiesRequired = settings.foreignSpyMax >= 0 ? settings.foreignSpyMax : Number.MAX_SAFE_INTEGER;
                if (spiesRequired < 1 && foreign.policy !== "Occupy" && foreign.policy !== "Ignore") {
                    spiesRequired = 1;
                }
                // We need 3 spies to purchase, but only if we have enough money cap to purchase
                // City price affected by unrest, and we can't see unrest without 3 spies.
                // Here we're comparing max money with hardcoded minimum cost
                if (spiesRequired < 3 && foreign.policy === "Purchase" && resources.Money.maxQuantity >= [865350, 1153800, 1730700][foreign.id]) {
                    spiesRequired = 3;
                }

                // We reached the max number of spies allowed
                if (foreign.gov.spy >= spiesRequired){
                    continue;
                }

                GameLog.logSuccess(GameLog.Types.spying, `Training a spy to send against ${getGovName(foreign.id)}.`);
                foreignVue.spy(foreign.id);
            }
        }

        // We can't use our spies yet
        if (!haveTech("spy", 2)) {
            return;
        }

        // Perform espionage
        for (let i = 0; i < activeForeigns.length; i++) {
            let foreign = activeForeigns[i];
            // Spy is missing, busy, or have nosthing to do
            if (foreign.gov.spy < 1 || foreign.gov.sab !== 0 || foreign.policy === "None") {
                continue;
            }

            let espionageMission = SpyManager.Types[foreign.policy === "Occupy" ? "Sabotage" : foreign.policy];
            if (!espionageMission) {
                continue;
            }

            // Unoccupy power if it's controlled, but we want something different
            if ((foreign.gov.anx && foreign.policy !== "Annex") ||
                (foreign.gov.buy && foreign.policy !== "Purchase") ||
                (foreign.gov.occ && foreign.policy !== "Occupy")){
                WarManager.release(foreign.id);
                foreign.released = true;
            } else if (!foreign.gov.anx && !foreign.gov.buy && !foreign.gov.occ) {
                SpyManager.performEspionage(foreign.id, espionageMission.id, foreign !== currentTarget);
            }
        }
    }

    function autoBattle([activeForeigns, currentTarget]) {
        let m = WarManager;
        if (m.maxCityGarrison <= 0 || state.goal === "Reset" || settings.foreignPacifist) {
            return;
        }

        // If we are not fully ready then return
        if ((m.wounded > (1 - settings.foreignAttackHealthySoldiersPercent / 100) * m.maxCityGarrison && !game.global.race['rage'] ) ||
            (m.currentCityGarrison < settings.foreignAttackLivingSoldiersPercent / 100 * m.maxCityGarrison && (!settings.foreignProtectSoldiers || settings.foreignMinAdvantage < 75))) {
            return;
    }

        // Calculating safe size of battalions, if needed

        // TODO: Configurable max
        let maxBattalion = new Array(5).fill(m.maxCityGarrison);
        if (settings.foreignProtectSoldiers) {
            let armor = ((game.global.race.scales ? 2 : 0) + (game.global.tech.armor ?? 0)) * (game.global.race.armored ? 4 : 1) - (game.global.race.frail ? 1 : 0);
            let protectedBattalion = [5, 10, 25, 50, 999].map((cap, tactic) => (armor >= cap ? Number.MAX_SAFE_INTEGER : ((armor - (game.global.city.ptrait === 'rage' ? 1 : 0)) * (5 - tactic))));
            maxBattalion = maxBattalion.map((garrison, tactic) => Math.min(garrison, protectedBattalion[tactic]));
        }
        maxBattalion[4] = Math.min(maxBattalion[4], settings.foreignMaxSiegeBattalion);

        let requiredBattalion = settings.foreignProtectSoldiers ? 0 : m.maxCityGarrison;
        let requiredTactic = 0;

        // Check if there's something that we want and can occupy, and switch to that target if found
        for (let i = 0; i < activeForeigns.length; i++) {
            let foreign = activeForeigns[i];
            if (foreign.policy === "Occupy" && !foreign.gov.occ) {
                let soldiersMin = m.getSoldiersForAdvantage(settings.foreignMinAdvantage, 4, foreign.id);
                if (soldiersMin <= m.maxCityGarrison) {
                    currentTarget = foreign;
                    requiredBattalion = Math.max(soldiersMin, Math.min(m.availableGarrison, m.getSoldiersForAdvantage(settings.foreignMaxAdvantage, 4, foreign.id) - 1));
                    requiredTactic = 4;
                    break;
                }
            }
        }

        // Nothing to attack
        if (!currentTarget) {
            return;
        }

        if (requiredTactic !== 4) {
            // If we don't need to occupy our target, then let's find best tactic for plundering
            // Never try siege if it can mess with unification
            for (let i = !settings.foreignUnification || settings.foreignOccupyLast ? 4 : 3; i >= 0; i--) {
                let soldiersMin = m.getSoldiersForAdvantage(settings.foreignMinAdvantage, i, currentTarget.id);
                if (soldiersMin <= maxBattalion[i]) {
                    requiredBattalion = Math.max(soldiersMin, Math.min(maxBattalion[i], m.availableGarrison, m.getSoldiersForAdvantage(settings.foreignMaxAdvantage, i, currentTarget.id) - 1));
                    requiredTactic = i;
                    break;
                }
            }
        }

        // Not enough healthy soldiers, keep resting
        if (!requiredBattalion || requiredBattalion > m.availableGarrison) {
            return;
        }

        // Occupy can pull soldiers from ships, let's make sure it won't happen
        if (!currentTarget.released && (currentTarget.gov.anx || currentTarget.gov.buy || currentTarget.gov.occ)) {
            // If it occupied currently - we'll get enough soldiers just by unoccupying it
            m.release(currentTarget.id);
        }
        if (requiredTactic === 4 && m.crew > 0) {
            let missingSoldiers = getOccCosts() - (m.currentCityGarrison - requiredBattalion);
            if (missingSoldiers > 0) {
                // Not enough soldiers in city, let's try to pull them from hell
                if (!settings.autoHell || !m.initHell() || m.hellSoldiers - m.hellReservedSoldiers < missingSoldiers) {
                    return;
                }
                let patrolsToRemove = Math.ceil((missingSoldiers - m.hellGarrison) / m.hellPatrolSize);
                if (patrolsToRemove > 0) {
                    m.removeHellPatrol(patrolsToRemove);
                }
                m.removeHellGarrison(missingSoldiers);
            }
        }

        // Set attack type
        m.setTactic(requiredTactic);

        // Now adjust our battalion size to fit between our campaign attack rating ranges
        let deltaBattalion = requiredBattalion - m.raid;
        if (deltaBattalion > 0) {
            m.addBattalion(deltaBattalion);
        }
        if (deltaBattalion < 0) {
            m.removeBattalion(deltaBattalion * -1);
        }

        // Log the interaction
        let campaignTitle = m.getCampaignTitle(requiredTactic);
        let battalionRating = game.armyRating(m.raid, "army");
        let advantagePercent = m.getAdvantage(battalionRating, requiredTactic, currentTarget.id).toFixed(1);
        GameLog.logSuccess(GameLog.Types.attack, `Launching ${campaignTitle} campaign against ${getGovName(currentTarget.id)} with ${currentTarget.gov.spy < 1 ? "~" : ""}${advantagePercent}% advantage.`);

        m.launchCampaign(currentTarget.id);

        return true;
    }

    function autoHell() {
        let m = WarManager;
        if (!m.initGarrison() || !m.initHell()) {
            return;
        }

        if (settings.disableHell || (settings.prestigeType === "ascension" && settings.maxSoulGems && resources.Soul_Gem.currentQuantity >= settings.maxSoulGems)) {
            m.hellAttractorMax = 0;
            if (m.hellSoldiers > 0) {
                m.removeHellPatrolSize(25000);
                m.removeHellPatrol(25000);
                m.removeHellGarrison(25000);
            }
            return;
        }

        if (settings.hellTurnOffLogMessages) {
            if (game.global.portal.fortress.notify === "Yes") {
                $("#fort .b-checkbox").eq(0).click();
            }
            if (game.global.portal.fortress.s_ntfy === "Yes") {
                $("#fort .b-checkbox").eq(1).click();
            }
        }

        // Determine the number of powered attractors
        // The goal is to keep threat in the desired range
        // If threat is larger than the configured top value, turn all attractors off
        // If threat is lower than the bottom value, turn all attractors on
        // Linear in between
        m.hellAttractorMax = 0;
        if (buildings.BadlandsAttractor.isSmartManaged() && game.global.portal.fortress.threat < settings.hellAttractorTopThreat && m.hellAssigned > 0) {
            m.hellAttractorMax = game.global.portal.attractor.count;
            if (game.global.portal.fortress.threat > settings.hellAttractorBottomThreat && settings.hellAttractorTopThreat > settings.hellAttractorBottomThreat) {
                m.hellAttractorMax = Math.floor(m.hellAttractorMax * (settings.hellAttractorTopThreat - game.global.portal.fortress.threat)
                                                    / (settings.hellAttractorTopThreat - settings.hellAttractorBottomThreat));
            }
        }

        if (!settings.hellHandlePatrolCount) { return; }

        // Determine Patrol size and count
        let targetHellSoldiers = 0;
        let targetHellPatrols = 0;
        let targetHellPatrolSize = 0;
        // First handle not having enough soldiers, then handle patrols
        // Only go into hell at all if soldiers are close to full, or we are already there
        if (m.maxSoldiers > settings.hellHomeGarrison + settings.hellMinSoldiers &&
           (m.hellSoldiers > settings.hellMinSoldiers || (m.currentSoldiers >= m.maxSoldiers * settings.hellMinSoldiersPercent / 100))) {
            targetHellSoldiers = Math.min(m.currentSoldiers, m.maxSoldiers) - settings.hellHomeGarrison; // Leftovers from an incomplete patrol go to hell garrison
            let availableHellSoldiers = targetHellSoldiers - m.hellReservedSoldiers;

            // Determine target hell garrison size
            // Estimated average damage is roughly 35 * threat / defense, so required defense = 35 * threat / targetDamage
            // But the threat hitting the fortress is only an intermediate result in the bloodwar calculation, it happens after predators and patrols but before repopulation,
            // So siege threat is actually lower than what we can see. Patrol and drone damage is wildly swingy and hard to estimate, so don't try to estimate the post-fight threat.
            // Instead base the defense on the displayed threat, and provide an option to bolster defenses when the walls get low. The threat used in the calculation
            // ranges from 1 * threat for 100% walls to the multiplier entered in the settings at 0% walls.
            let hellWallsMulti = settings.hellLowWallsMulti * (1 - game.global.portal.fortress.walls / 100); // threat modifier from damaged walls = 1 to lowWallsMulti
            let hellTargetFortressDamage = game.global.portal.fortress.threat * 35 / settings.hellTargetFortressDamage; // required defense to meet target average damage based on current threat
            let hellTurretPower = buildings.PortalTurret.stateOnCount * (game.global.tech['turret'] ? (game.global.tech['turret'] >= 2 ? 70 : 50) : 35); // turrets count and power
            let hellGarrison = m.getSoldiersForAttackRating(Math.max(0, hellWallsMulti * hellTargetFortressDamage - hellTurretPower)); // don't go below 0

            // Always have at least half our hell contingent available for patrols, and if we cant defend properly just send everyone
            if (availableHellSoldiers < hellGarrison) {
                hellGarrison = 0; // If we cant defend adequately, send everyone out on patrol
            } else if (availableHellSoldiers < hellGarrison * 2) {
                hellGarrison = Math.floor(availableHellSoldiers / 2); // Always try to send out at least half our people
            }

            // Determine the patrol attack rating
            // let tempRating1 = 0;
            // let tempRating2 = 0;
            if (settings.hellHandlePatrolSize) {
                let patrolRating = game.global.portal.fortress.threat * settings.hellPatrolThreatPercent / 100;
                //tempRating1 = patrolRating;

                // Now reduce rating based on drones, droids and bootcamps
                if (game.global.portal.war_drone) {
                    patrolRating -= settings.hellPatrolDroneMod * game.global.portal.war_drone.on * (game.global.tech['portal'] >= 7 ? 1.5 : 1);
                }
                if (game.global.portal.war_droid) {
                    patrolRating -= settings.hellPatrolDroidMod * game.global.portal.war_droid.on * (game.global.tech['hdroid'] ? 2 : 1);
                }
                if (game.global.city.boot_camp) {
                    patrolRating -= settings.hellPatrolBootcampMod * game.global.city.boot_camp.count;
                }
                //tempRating2 = patrolRating;

                // In the end, don't go lower than the minimum...
                patrolRating = Math.max(patrolRating, settings.hellPatrolMinRating);

                // Increase patrol attack rating if alive soldier count is low to reduce patrol losses
                if (settings.hellBolsterPatrolRating > 0 && settings.hellBolsterPatrolPercentTop > 0) { // Check if settings are on
                    const homeGarrisonFillRatio = m.currentCityGarrison / m.maxCityGarrison;
                    if (homeGarrisonFillRatio <= settings.hellBolsterPatrolPercentTop / 100) { // If less than top
                        if (homeGarrisonFillRatio <= settings.hellBolsterPatrolPercentBottom / 100) { // and less than bottom
                            patrolRating += settings.hellBolsterPatrolRating; // add full rating
                        } else if (settings.hellBolsterPatrolPercentBottom < settings.hellBolsterPatrolPercentTop) { // If between bottom and top
                            patrolRating += settings.hellBolsterPatrolRating * (settings.hellBolsterPatrolPercentTop / 100 - homeGarrisonFillRatio) // add rating proportional to where in the range we are
                                              / (settings.hellBolsterPatrolPercentTop - settings.hellBolsterPatrolPercentBottom) * 100;
                        }
                    }
                }

                // Patrol size
                targetHellPatrolSize = m.getSoldiersForAttackRating(patrolRating);

                // If patrol size is larger than available soldiers, send everyone available instead of 0
                targetHellPatrolSize = Math.min(targetHellPatrolSize, availableHellSoldiers - hellGarrison);
            } else {
                targetHellPatrolSize = m.hellPatrolSize;
            }

            // Determine patrol count
            targetHellPatrols = Math.floor((availableHellSoldiers - hellGarrison) / targetHellPatrolSize);

            // Special logic for small number of patrols
            if (settings.hellHandlePatrolSize && targetHellPatrols === 1) {
                // If we could send 1.5 patrols, send 3 half-size ones instead
                if ((availableHellSoldiers - hellGarrison) >= 1.5 * targetHellPatrolSize) {
                    targetHellPatrolSize = Math.floor((availableHellSoldiers - hellGarrison) / 3);
                    targetHellPatrols = Math.floor((availableHellSoldiers - hellGarrison) / targetHellPatrolSize);
                }
            }

            //console.log("availableHellSoldiers: "+availableHellSoldiers+"  hellGarrison: "+hellGarrison+" patrolSize: "+targetHellPatrolSize+"  Patrols: "+targetHellPatrols+"  Patrol Rating threat/buildings/final: "
            //             +tempRating1+"/"+tempRating2+"/"+patrolRating);
        } else {
            // Try to leave hell if any soldiers are still assigned so the game doesn't put miniscule amounts of soldiers back
            if (m.hellAssigned > 0) {
                m.removeHellPatrolSize(25000);
                m.removeHellPatrol(25000);
                m.removeHellGarrison(25000);
                return;
            }
        }

        // Adjust values ingame
        // First decrease patrols, then put hell soldiers to the right amount, then increase patrols, to make sure all actions go through
        if (settings.hellHandlePatrolSize && m.hellPatrolSize > targetHellPatrolSize) m.removeHellPatrolSize(m.hellPatrolSize - targetHellPatrolSize);
        if (m.hellPatrols > targetHellPatrols) m.removeHellPatrol(m.hellPatrols - targetHellPatrols);
        if (m.hellSoldiers > targetHellSoldiers) m.removeHellGarrison(m.hellSoldiers - targetHellSoldiers);
        if (m.hellSoldiers < targetHellSoldiers) m.addHellGarrison(targetHellSoldiers - m.hellSoldiers);
        if (settings.hellHandlePatrolSize && m.hellPatrolSize < targetHellPatrolSize) m.addHellPatrolSize(targetHellPatrolSize - m.hellPatrolSize);
        if (m.hellPatrols < targetHellPatrols) m.addHellPatrol(targetHellPatrols - m.hellPatrols);
    }

    function autoJobs() {
        let jobList = JobManager.managedPriorityList();

        // No jobs unlocked yet
        if (jobList.length === 0) {
            return;
        }

        let farmerIndex = isDemonRace() || isHunterRace() ? jobList.indexOf(jobs.Hunter) : jobList.indexOf(jobs.Farmer);
        let lumberjackIndex = isDemonRace() && isLumberRace() ? farmerIndex : jobList.indexOf(jobs.Lumberjack);
        let quarryWorkerIndex = jobList.indexOf(jobs.QuarryWorker);
        let crystalMinerIndex = jobList.indexOf(jobs.CrystalMiner);
        let scavengerIndex = jobList.indexOf(jobs.Scavenger);

        let availableEmployees = jobList.reduce((total, job) => total + job.count, 0);
        let availableCraftsmen = JobManager.craftingMax();

        let crewMissing = game.global.civic.crew.max - game.global.civic.crew.workers;
        let minDefault = crewMissing > 0 ? crewMissing + 1 : 0;

        let requiredJobs = [];
        let jobAdjustments = [];

        log("autoJobs", "Total employees: " + availableEmployees);

        // First figure out how many farmers are required
        let minFarmers = 0;
        if (farmerIndex !== -1) {
            let foodRateOfChange = resources.Food.calculateRateOfChange({buy: true});
            let minFoodStorage = resources.Food.maxQuantity * 0.2;
            let maxFoodStorage = resources.Food.maxQuantity * 0.6;
            if (game.global.race['ravenous']) { // Ravenous hunger
                minFoodStorage = resources.Population.currentQuantity * 1.5;
                maxFoodStorage = resources.Population.currentQuantity * 3;
                foodRateOfChange += Math.max(resources.Food.currentQuantity / 3, 0);
            }
            if (game.global.race['carnivore']) { // Food spoilage
                minFoodStorage = resources.Population.currentQuantity;
                maxFoodStorage = resources.Population.currentQuantity * 2;
                if (resources.Food.currentQuantity > 10) {
                    foodRateOfChange += (resources.Food.currentQuantity - 10) * 0.5 * (0.9 ** buildings.Smokehouse.count);
                }
            }

            if (jobList.length === (jobList.indexOf(jobs.Unemployed) === -1 ? 1 : 2)) {
                // No other jobs are unlocked - everyone on farming!
                requiredJobs[farmerIndex] = availableEmployees;
                log("autoJobs", "Pushing all farmers");
            } else if (resources.Population.currentQuantity > state.lastPopulationCount) {
                let populationChange = resources.Population.currentQuantity - state.lastPopulationCount;
                let farmerChange = jobList[farmerIndex].count - state.lastFarmerCount;

                if (populationChange === farmerChange && foodRateOfChange > 0) {
                    requiredJobs[farmerIndex] = jobList[farmerIndex].count - populationChange;
                    log("autoJobs", "Removing a farmer due to population growth")
                } else {
                    requiredJobs[farmerIndex] = jobList[farmerIndex].count;
                }
            } else if (resources.Food.isCapped()) {
                // Full food storage, remove all farmers instantly
                requiredJobs[farmerIndex] = 0;
            } else if (resources.Food.currentQuantity + foodRateOfChange * gameTicksPerSecond("mid") < minFoodStorage) {
                // We want food to fluctuate between 0.2 and 0.6 only. We only want to add one per loop until positive
                if (jobList[farmerIndex].count === 0) { // We can't calculate production with no workers, assign one first
                    requiredJobs[farmerIndex] = 1;
                    log("autoJobs", "Adding one farmer");
                } else {
                    let foodPerWorker = resources.Food.getProduction("job_" + jobList[farmerIndex].id) / jobList[farmerIndex].count;
                    let missingWorkers = Math.ceil(foodRateOfChange / -foodPerWorker) || 0;
                    requiredJobs[farmerIndex] = jobList[farmerIndex].count + missingWorkers;
                    log("autoJobs", `Adding ${missingWorkers} farmers`);
                }
            } else if (resources.Food.currentQuantity > maxFoodStorage && foodRateOfChange > 0) {
                // We want food to fluctuate between 0.2 and 0.6 only. We only want to remove one per loop until negative
                requiredJobs[farmerIndex] = jobList[farmerIndex].count - 1;
                log("autoJobs", "Removing one farmer");
            } else {
                // We're good; leave farmers as they are
                requiredJobs[farmerIndex] = jobList[farmerIndex].count;
                log("autoJobs", "Leaving current farmers");
            }

            requiredJobs[farmerIndex] = Math.min(requiredJobs[farmerIndex], availableEmployees);
            requiredJobs[farmerIndex] = Math.max(requiredJobs[farmerIndex], 0);

            jobAdjustments[farmerIndex] = requiredJobs[farmerIndex] - jobList[farmerIndex].count;
            availableEmployees -= requiredJobs[farmerIndex];
            minFarmers = requiredJobs[farmerIndex];
        }

        // We're only crafting when we have enough population to fill farmers, all foundries, and still have some employees for other work.
        if (settings.autoCraftsmen && availableEmployees > availableCraftsmen * 2) {
            availableEmployees -= availableCraftsmen;
        } else {
            availableCraftsmen = 0;
        }

        // Now assign crafters
        if (settings.autoCraftsmen){
            // Taken from game source, no idea what this "140" means.
            let speed = game.global.genes['crafty'] ? 2 : 1;
            let craft_costs = game.global.race['resourceful'] ? 0.9 : 1;
            let costMod = speed * craft_costs / 140;

            // Get list of craftabe resources
            let availableJobs = [];
            craftersLoop:
            for (let i = 0; i < JobManager.craftingJobs.length; i++) {
                let job = JobManager.craftingJobs[i];
                let resource = job.resource;
                // Check if we're allowed to craft this resource
                if (!job.isManaged() || !resource.autoCraftEnabled || (settings.jobDisableCraftsmans && !game.global.race['no_craft'] && job !== jobs.Scarletite)) {
                    continue;
                }
                let resourceDemanded = resource.isDemanded();

                // And have enough resources to craft it for at least 2 seconds
                let afforableAmount = availableCraftsmen;
                let lowestRatio = 1;
                for (let j = 0; j < resource.resourceRequirements.length; j++) {
                    let requirement = resource.resourceRequirements[j];
                    if (requirement.resource.isDemanded() && !resourceDemanded) {
                        continue craftersLoop;
                    }
                    afforableAmount = Math.min(afforableAmount, requirement.resource.currentQuantity / (requirement.quantity * costMod) / 2);
                    lowestRatio = Math.min(lowestRatio, requirement.resource.storageRatio);
                }

                if (lowestRatio < resource.craftPreserve && !resourceDemanded) {
                    continue;
                }

                // Assigning Scarletite right now, so it won't be filtered out by priority checks below, as we want to have scarletite + some other with remaining crafters
                if (job === jobs.Scarletite) {
                    let maxScar = buildings.RuinsHellForge.stateOnCount;
                    if (afforableAmount < maxScar || (settings.prestigeType === "ascension" && isPillarFinished())) {
                        jobAdjustments[jobList.indexOf(job)] = 0 - job.count;
                    } else {
                        jobAdjustments[jobList.indexOf(job)] = maxScar - job.count;
                        availableCraftsmen -= maxScar;
                    }
                    continue;
                }

                if (afforableAmount < availableCraftsmen){
                    continue;
                }

                availableJobs.push(job);
            }

            let requestedJobs = availableJobs.filter(job => job.resource.isDemanded());
            if (requestedJobs.length > 0) {
                availableJobs = requestedJobs;
            } else if (settings.productionFoundryWeighting === "demanded") {
                let usefulJobs = availableJobs.filter(job => job.resource.currentQuantity < job.resource.storageRequired);
                if (usefulJobs.length > 0) {
                    availableJobs = usefulJobs;
                }
            }

            if (settings.productionFoundryWeighting === "buildings" && state.otherTargets.length > 0) {
                let scaledWeightings = Object.fromEntries(availableJobs.map(job => [job.id, (state.otherTargets.find(building => resourceCost(building, job.resource) > job.resource.currentQuantity)?.weighting ?? 0) * job.resource.craftWeighting]));
                availableJobs.sort((a, b) => (a.resource.currentQuantity / scaledWeightings[a.id]) - (b.resource.currentQuantity / scaledWeightings[b.id]));
            } else {
                availableJobs.sort((a, b) => (a.resource.currentQuantity / a.resource.craftWeighting) - (b.resource.currentQuantity / b.resource.craftWeighting));
            }

            for (let i = 0; i < JobManager.craftingJobs.length; i++) {
                let job = JobManager.craftingJobs[i];
                let jobIndex = jobList.indexOf(job);

                if (jobIndex === -1 || job === jobs.Scarletite) {
                    continue;
                }

                // Having empty array and undefined availableJobs[0] is fine - we still need to remove other crafters.
                if (job === availableJobs[0]){
                    jobAdjustments[jobIndex] = availableCraftsmen - job.count;
                } else {
                    jobAdjustments[jobIndex] = 0 - job.count;
                }
            }

            // We didn't assigned crafter for some reason, return employees so we can use them somewhere else
            if (availableJobs[0] === undefined){
                availableEmployees += availableCraftsmen;
            }
        }

        let minersDisabled = settings.jobDisableMiners && buildings.GatewayStarbase.count > 0;

        // And deal with the rest now
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < jobList.length; j++) {
                let job = jobList[j];

                // Don't assign 3rd breakpoints for jobs we're going to split, just first two to reserve some workers
                if (i === 2 && (j === lumberjackIndex || j === quarryWorkerIndex || j === crystalMinerIndex || j === scavengerIndex)) {
                    continue;
                }

                // We've already done with crafters
                if (job instanceof CraftingJob) {
                    continue;
                }

                let currentEmployees = requiredJobs[j] ?? 0;
                availableEmployees += currentEmployees;

                let minEmployees = job.isDefault() ? minDefault : 0;
                let currentBreakpoint = (job === jobs.Hunter && isDemonRace() && isLumberRace()) ? jobs.Lumberjack.breakpointEmployees(i) : job.breakpointEmployees(i);
                let jobsToAssign = Math.min(availableEmployees, Math.max(minEmployees, currentEmployees, currentBreakpoint));

                log("autoJobs", "job " + job._originalId + " currentBreakpoint " + currentBreakpoint + " availableEmployees " + availableEmployees);

                if (job === jobs.SpaceMiner) {
                    state.maxSpaceMiners = Math.max(state.maxSpaceMiners, Math.min(availableEmployees, job.breakpoints[i] < 0 ? Number.MAX_SAFE_INTEGER : job.breakpoints[i]));
                    let minersNeeded = buildings.BeltEleriumShip.stateOnCount * 2 + buildings.BeltIridiumShip.stateOnCount + buildings.BeltIronShip.stateOnCount;
                    jobsToAssign = Math.min(jobsToAssign, minersNeeded);
                }

                if (job === jobs.Entertainer && !haveTech("superstar")) {
                    let taxBuffer = (settings.autoTax || haveTask("tax")) && game.global.civic.taxes.tax_rate < poly.taxCap(false) ? 1 : 0;
                    let entertainerMorale = game.global.tech['theatre'] + (game.global.race['musical'] ? 1 : 0);
                    let moraleExtra = game.global.city.morale.potential - game.global.city.morale.cap - taxBuffer;
                    let entertainersDelta = Math.floor(moraleExtra / entertainerMorale);
                    jobsToAssign = Math.min(jobsToAssign, job.count - entertainersDelta);
                }

                // TODO: Remove extra bankers when cap not needed
                // Don't assign bankers if our money is maxed and bankers aren't contributing to our money storage cap
                if (job === jobs.Banker && (resources.Money.isCapped() || game.global.civic.taxes.tax_rate <= 0) && !haveTech("banking", 7)) {
                    jobsToAssign = 0;
                }
                // Don't assign miners and Andromeda
                if ((job === jobs.Miner || job === jobs.CoalMiner) && minersDisabled) {
                    jobsToAssign = 0;
                }

                // Races with the Intelligent trait get bonus production based on the number of professors and scientists
                // Only unassign them when knowledge is max if the race is not intelligent
                // Once we've research shotgun sequencing we get boost and soon autoassemble genes so stop unassigning
                if (!game.global.race['intelligent'] && !haveTech("genetics", 5)) {
                    // Don't assign professors if our knowledge is maxed and professors aren't contributing to our temple bonus
                    if (job === jobs.Professor && resources.Knowledge.isCapped() && !haveTech("fanaticism", 2)) {
                        jobsToAssign = 0;
                    }

                    // Don't assign scientists if our knowledge is maxed and scientists aren't contributing to our knowledge cap
                    if (job === jobs.Scientist && resources.Knowledge.isCapped() && !haveTech("science", 5)) {
                        jobsToAssign = 0;
                    }
                }

                if (job === jobs.CrystalMiner && !resources.Crystal.isUseful()) {
                    jobsToAssign = Math.min(jobsToAssign, resources.Crystal.getBusyWorkers("job_crystal_miner", jobs.CrystalMiner.count));
                }
                if (job === jobs.CementWorker) {
                    let stoneRateOfChange = resources.Stone.calculateRateOfChange({buy: true}) + (job.count * 3) - 5;
                    if (game.global.race['smoldering'] && settings.autoQuarry) {
                        stoneRateOfChange += resources.Chrysotile.calculateRateOfChange({buy: true});
                    }
                    jobsToAssign = Math.min(jobsToAssign, Math.floor(stoneRateOfChange / 3));
                    if (!resources.Cement.isUseful()) {
                        jobsToAssign = Math.min(jobsToAssign, resources.Cement.getBusyWorkers("city_cement_plant_bd", jobs.CementWorker.count));
                    }
                }

                if (job === jobs.Surveyor && game.global.portal.fortress.threat > 9000 && resources.Population.storageRatio < 1) {
                    jobsToAssign = 0;
                }

                jobsToAssign = Math.max(0, jobsToAssign);
                requiredJobs[j] = jobsToAssign;
                jobAdjustments[j] = jobsToAssign - job.count;
                availableEmployees -= jobsToAssign;

                log("autoJobs", "job " + job._originalId +  " has jobsToAssign: " + jobsToAssign + ", availableEmployees: " + availableEmployees + ", availableCraftsmen: " + availableCraftsmen);
            }

            // No more workers available
            if (availableEmployees <= 0) {
                break;
            }
        }

        let splitJobs = [];
        if (lumberjackIndex !== -1) splitJobs.push( { jobIndex: lumberjackIndex, job: jobs.Lumberjack, weighting: settings.jobLumberWeighting} );
        if (quarryWorkerIndex !== -1) splitJobs.push( { jobIndex: quarryWorkerIndex, job: jobs.QuarryWorker, weighting: settings.jobQuarryWeighting});
        if (crystalMinerIndex !== -1 && resources.Crystal.isUseful()) splitJobs.push( { jobIndex: crystalMinerIndex, job: jobs.CrystalMiner, weighting: settings.jobCrystalWeighting});
        if (scavengerIndex !== -1) splitJobs.push( { jobIndex: scavengerIndex, job: jobs.Scavenger, weighting: settings.jobScavengerWeighting});

        // Balance lumberjacks, quarry workers, crystal miners and scavengers if they are unlocked
        if (splitJobs.length > 0) {
            let totalWeighting = 0;

            // Reduce jobs required down to minimum and add them to the available employee pool so that we can split them according to weightings
            splitJobs.forEach(jobDetails => {
                let minEmployees = 0;
                if (jobDetails.jobIndex === farmerIndex) {
                    minEmployees = Math.max(minEmployees, minFarmers);
                }
                if (jobList[jobDetails.jobIndex].isDefault()) {
                    minEmployees = Math.max(minEmployees, minDefault);
                }
                availableEmployees += requiredJobs[jobDetails.jobIndex] - minEmployees;
                requiredJobs[jobDetails.jobIndex] = minEmployees;
                jobAdjustments[jobDetails.jobIndex] = minEmployees - jobList[jobDetails.jobIndex].count;
                totalWeighting += jobDetails.weighting;
            });

            // Bring them all up to required breakpoints, one each at a time
            let splitSorter = (a, b) => ((requiredJobs[a.jobIndex] / a.weighting) - (requiredJobs[b.jobIndex] / b.weighting)) || a.jobIndex - b.jobIndex;
            for (let b = 0; b < 3 && availableEmployees > 0; b++) {
                let remainingJobs = splitJobs.slice();
                while (availableEmployees > 0 && remainingJobs.length > 0) {
                    let jobDetails = remainingJobs.sort(splitSorter)[0];
                    if (b == 2 || requiredJobs[jobDetails.jobIndex] < jobDetails.job.breakpointEmployees(b)) {
                        requiredJobs[jobDetails.jobIndex]++;
                        jobAdjustments[jobDetails.jobIndex]++;
                        availableEmployees--;
                    } else {
                        remainingJobs.shift();
                    }
                }
            }
        } else {
            // No lumberjacks, quarry workers, crystal miners or scavengers...
            if (farmerIndex !== -1) {
                requiredJobs[farmerIndex] += availableEmployees;
                jobAdjustments[farmerIndex] += availableEmployees;
                availableEmployees = 0;
            }
        }

        for (let i = 0; i < jobAdjustments.length; i++) {
            let adjustment = jobAdjustments[i];
            if (adjustment < 0) {
                jobList[i].removeWorkers(-1 * adjustment);
                log("autoJobs", "Adjusting job " + jobList[i]._originalId + " down by " + adjustment);
            }
        }

        for (let i = 0; i < jobAdjustments.length; i++) {
            let adjustment = jobAdjustments[i];
            if (adjustment > 0) {
                jobList[i].addWorkers(adjustment);
                log("autoJobs", "Adjusting job " + jobList[i]._originalId + " up by " + adjustment);
            }
        }

        state.lastPopulationCount = resources.Population.currentQuantity;
        state.lastFarmerCount = jobList[farmerIndex]?.count ?? 0;

        // After reassignments adjust default job to something with workers, we need that for sacrifices.
        // Unless we're already assigning to default, and don't want it to be changed now
        if (settings.jobSetDefault && minDefault === 0) {
            /*if (jobs.Forager.isManaged() && requiredJobs[jobList.indexOf(jobs.Forager)] > 0) {
                jobs.Forager.setAsDefault();
            } else*/
            if (jobs.QuarryWorker.isManaged() && requiredJobs[quarryWorkerIndex] > 0) {
                jobs.QuarryWorker.setAsDefault();
            } else if (jobs.Lumberjack.isManaged() && requiredJobs[lumberjackIndex] > 0) {
                jobs.Lumberjack.setAsDefault();
            } else if (jobs.CrystalMiner.isManaged() && requiredJobs[crystalMinerIndex] > 0) {
                jobs.CrystalMiner.setAsDefault();
            } else if (jobs.Scavenger.isManaged() && requiredJobs[scavengerIndex] > 0) {
                jobs.Scavenger.setAsDefault();
            } else if (jobs.Farmer.isManaged()) {
                jobs.Farmer.setAsDefault();
            } else if (jobs.Hunter.isManaged()) {
                jobs.Hunter.setAsDefault();
            } else if (jobs.Unemployed.isManaged()) {
                jobs.Unemployed.setAsDefault();
            }
        }
    }

    function autoTax() {
        if (haveTask("tax")) {
            return;
        }

        let taxVue = getVueById('tax_rates');
        if (taxVue === undefined || !game.global.civic.taxes.display) {
            return;
        }

        let currentTaxRate = game.global.civic.taxes.tax_rate;
        let currentMorale = game.global.city.morale.current;
        let realMorale = game.global.city.morale.potential;
        let maxMorale = game.global.city.morale.cap;
        let minMorale = settings.generalMinimumMorale;

        let maxTaxRate = poly.taxCap(false);
        let minTaxRate = poly.taxCap(true);
        if (resources.Money.storageRatio < 0.9) {
            minTaxRate = Math.max(minTaxRate, settings.generalMinimumTaxRate);
        }

        let optimalTax = resources.Money.isDemanded() ? maxTaxRate : Math.round((maxTaxRate - minTaxRate) * Math.max(0, 0.9 - resources.Money.storageRatio)) + minTaxRate;

        if (!game.global.race['banana']) {
            if (currentTaxRate < 20) { // Exposed morale cap includes bonus of current low taxes, roll it back
                maxMorale -= 10 - Math.floor(currentTaxRate / 2);
            }
            if (optimalTax < 20) {  // And add full bonus if we actually need it
                maxMorale += 10 - Math.floor(minTaxRate / 2);
            }
        }
        if (resources.Money.storageRatio < 0.9) {
            maxMorale = Math.min(maxMorale, settings.generalMaximumMorale);
        }

        if (currentTaxRate < maxTaxRate && currentMorale >= minMorale + 1 &&
              (currentTaxRate < optimalTax || currentMorale >= maxMorale + 1 || (realMorale >= currentMorale + 1 && optimalTax >= 20))) {
            resetMultiplier();
            taxVue.add();
        }

        if (currentTaxRate > minTaxRate && currentMorale < maxMorale &&
              (currentTaxRate > optimalTax || currentMorale < minMorale)) {
            resetMultiplier();
            taxVue.sub();
        }

    }

    function autoPylon() {
        // If not unlocked then nothing to do
        if (!RitualManager.initIndustry()) {
            return;
        }

        let spells = Object.values(RitualManager.Productions).filter(spell => spell.isUnlocked() && spell.weighting > 0);

        // Init adjustment, and sort groups by priorities
        let pylonAdjustments = {};
        for (let spell of spells) {
            pylonAdjustments[spell.id] = 0;
            resources.Mana.rateOfChange += RitualManager.manaCost(RitualManager.currentSpells(spell));
        }
        let manaToUse = resources.Mana.rateOfChange * (resources.Mana.storageRatio > 0.99 ? 1 : settings.productionRitualManaUse);

        let usableMana = manaToUse;

        let spellSorter = (a, b) => ((pylonAdjustments[a.id] / a.weighting) - (pylonAdjustments[b.id] / b.weighting)) || b.weighting - a.weighting;
        let remainingSpells = spells.slice();
        while(remainingSpells.length > 0) {
            let spell = remainingSpells.sort(spellSorter)[0];
            let amount = pylonAdjustments[spell.id];
            let cost = RitualManager.manaCost(amount + 1) - RitualManager.manaCost(amount);

            if (cost <= manaToUse) {
                pylonAdjustments[spell.id] = amount + 1;
                manaToUse -= cost;
            } else {
                remainingSpells.shift();
            }
        }
        resources.Mana.rateOfChange - (usableMana - manaToUse);

        let pylonDeltas = spells.map((spell) => pylonAdjustments[spell.id] - RitualManager.currentSpells(spell));

        spells.forEach((spell, index) => pylonDeltas[index] < 0 && RitualManager.decreaseRitual(spell, pylonDeltas[index] * -1));
        spells.forEach((spell, index) => pylonDeltas[index] > 0 && RitualManager.increaseRitual(spell, pylonDeltas[index]));
    }

    function autoQuarry() {
        // Nothing to do here with no quarry, or smoldering
        if (!QuarryManager.initIndustry()) {
            return;
        }

        let chrysotileWeigth = resources.Chrysotile.isDemanded() ? Number.MAX_SAFE_INTEGER : (100 - resources.Chrysotile.storageRatio * 100);
        let stoneWeigth = resources.Stone.isDemanded() ? Number.MAX_SAFE_INTEGER : (100 - resources.Stone.storageRatio * 100);
        if (buildings.MetalRefinery.count > 0) {
            stoneWeigth = Math.max(stoneWeigth, resources.Aluminium.isDemanded() ? Number.MAX_SAFE_INTEGER : (100 - resources.Aluminium.storageRatio * 100));
        }
        chrysotileWeigth *= settings.productionChrysotileWeight;

        let newAsbestos = Math.round(chrysotileWeigth / (chrysotileWeigth + stoneWeigth) * 100);

        if (newAsbestos !== QuarryManager.currentAsbestos()) {
            QuarryManager.increaseAsbestos(newAsbestos - QuarryManager.currentAsbestos());
        }
    }

    function autoSmelter() {
        // No smelter; no auto smelter. No soup for you.
        if (game.global.race['steelen'] || !SmelterManager.initIndustry()) {
            return;
        }

        let smelterIronCount = SmelterManager.smeltingCount(SmelterManager.Productions.Iron);
        let smelterSteelCount = SmelterManager.smeltingCount(SmelterManager.Productions.Steel);
        let maxAllowedSteel = SmelterManager.maxOperating();

        let steelAdjust = 0;

        // Only adjust fuels if race does not have forge trait which means they don't require smelter fuel
        if (!game.global.race['forge']) {
            let remainingSmelters = SmelterManager.maxOperating();

            let fuels = SmelterManager.managedFuelPriorityList();
            let fuelAdjust = {};
            for (let i = 0; i < fuels.length; i++) {
                let fuel = fuels[i];
                if (!fuel.unlocked) {
                    continue;
                }

                let maxAllowedUnits = remainingSmelters;

                // Adjust Inferno to Oil ratio for better efficiency and cost
                if (fuel === SmelterManager.Fuels.Inferno && fuels[i+1] === SmelterManager.Fuels.Oil && remainingSmelters > 75) {
                    maxAllowedUnits = Math.floor(0.5 * remainingSmelters + 37.5);
                }

                fuel.cost.forEach(productionCost => {
                    let resource = productionCost.resource;

                    let remainingRateOfChange = resource.calculateRateOfChange({buy: true}) + (SmelterManager.fueledCount(fuel) * productionCost.quantity);
                    // No need to preserve minimum income when storage is full
                    if (resource.storageRatio < 0.98) {
                        remainingRateOfChange -= productionCost.minRateOfChange;
                    }

                    if (resource.storageRatio < 0.8 || resource === resources.StarPower){
                        let affordableAmount = Math.max(0, Math.floor(remainingRateOfChange / productionCost.quantity));
                        maxAllowedUnits = Math.min(maxAllowedUnits, affordableAmount);
                    }
                });

                remainingSmelters -= maxAllowedUnits;
                fuelAdjust[fuel.id] = maxAllowedUnits - SmelterManager.fueledCount(fuel);
            }

            for (let i = 0; i < fuels.length; i++) {
                let fuel = fuels[i];
                if (fuelAdjust[fuel.id] < 0) {
                    steelAdjust += fuelAdjust[fuel.id] * -1;
                    SmelterManager.decreaseFuel(fuel, fuelAdjust[fuel.id] * -1);
                }
            }

            for (let i = 0; i < fuels.length; i++) {
                let fuel = fuels[i];
                if (fuelAdjust[fuel.id] > 0) {
                    SmelterManager.increaseFuel(fuel, fuelAdjust[fuel.id]);
                }
            }

            // Adjusting fuel can move production from iron to steel, we need to account that
            steelAdjust = Math.max(0, steelAdjust - smelterIronCount);
        }

        // We only care about steel. It isn't worth doing a full generic calculation here
        // Just assume that smelters will always be fueled so Iron smelting is unlimited
        // We want to work out the maximum steel smelters that we can have based on our resource consumption
        let steelSmeltingConsumption = SmelterManager.Productions.Steel.cost;
        for (let i = 0; i < steelSmeltingConsumption.length; i++) {
            let productionCost = steelSmeltingConsumption[i];
            let resource = productionCost.resource;

            let remainingRateOfChange = resource.calculateRateOfChange({buy: true}) + (smelterSteelCount * productionCost.quantity);
            // No need to preserve minimum income when storage is full
            if (resource.storageRatio < 0.98) {
                remainingRateOfChange -= productionCost.minRateOfChange;
            }
            if (resource.storageRatio < 0.8){
                let affordableAmount = Math.max(0, Math.floor(remainingRateOfChange / productionCost.quantity));
                maxAllowedSteel = Math.min(maxAllowedSteel, affordableAmount);
            }
        }

        let ironWeighting = 0;
        let steelWeighting = 0;
        switch (settings.productionSmelting){
            case "iron":
                ironWeighting = resources.Iron.timeToFull;
                if (!ironWeighting) {
                    steelWeighting = resources.Steel.timeToFull;
                }
                break;
            case "steel":
                steelWeighting = resources.Steel.timeToFull;
                if (!steelWeighting) {
                    ironWeighting = resources.Iron.timeToFull;
                }
                break;
            case "storage":
                ironWeighting = resources.Iron.timeToFull;
                steelWeighting = resources.Steel.timeToFull;
                break;
            case "required":
                ironWeighting = resources.Iron.timeToRequired;
                steelWeighting = resources.Steel.timeToRequired;
                break;
        }

        if (resources.Iron.isDemanded()) {
            ironWeighting = Number.MAX_SAFE_INTEGER;
        }
        if (resources.Steel.isDemanded()) {
            steelWeighting = Number.MAX_SAFE_INTEGER;
        }


        // We have more steel than we can afford OR iron income is too low
        if (smelterSteelCount > maxAllowedSteel || smelterSteelCount > 0 && ironWeighting > steelWeighting) {
            steelAdjust--;
        }

        // We can afford more steel AND either steel income is too low OR both steel and iron full, but we can use steel smelters to increase titanium income
        if (smelterSteelCount < maxAllowedSteel && smelterIronCount > 0 &&
             ((steelWeighting > ironWeighting) ||
              (steelWeighting === 0 && ironWeighting === 0 && resources.Titanium.storageRatio < 0.99 && haveTech("titanium")))) {
            steelAdjust++;
        }

        if (steelAdjust > 0) {
            SmelterManager.increaseSmelting(SmelterManager.Productions.Steel, steelAdjust);
        }
        if (steelAdjust < 0) {
            SmelterManager.increaseSmelting(SmelterManager.Productions.Iron, steelAdjust * -1);
        }

        // It's possible to also remove steel smelters when when we have nothing to produce, to save some coal
        // Or even disable them completely. But it doesn't worth it. Let it stay as it is, without jerking around
    }

    function autoFactory() {
        // No factory; no auto factory
        if (!FactoryManager.initIndustry()) {
            return;
        }

        let allProducts = Object.values(FactoryManager.Productions);

        // Init adjustment, and sort groups by priorities
        let priorityGroups = {};
        let factoryAdjustments = {};
        for (let i = 0; i < allProducts.length; i++) {
            let production = allProducts[i];
            if (production.unlocked && production.enabled) {
                if (production.weighting > 0) {
                    let priority = production.resource.isDemanded() ? Math.max(production.priority, 100) : production.priority;
                    if (priority !== 0) {
                        priorityGroups[priority] = priorityGroups[priority] ?? [];
                        priorityGroups[priority].push(production);
                    }
                }
                factoryAdjustments[production.id] = 0;
            }
        }
        let priorityList = Object.keys(priorityGroups).sort((a, b) => b - a).map(key => priorityGroups[key]);
        if (priorityGroups["-1"] && priorityList.length > 1) {
            priorityList.splice(priorityList.indexOf(priorityGroups["-1"], 1));
            priorityList[0].push(...priorityGroups["-1"]);
        }

        // Calculate amount of factories per product
        let remainingFactories = FactoryManager.maxOperating();
        for (let i = 0; i < priorityList.length && remainingFactories > 0; i++) {
            let products = priorityList[i];
            while (remainingFactories > 0) {
                let factoriesToDistribute = remainingFactories;
                let totalPriorityWeight = products.reduce((sum, production) => sum + production.weighting, 0);

                for (let j = products.length - 1; j >= 0 && remainingFactories > 0; j--) {
                    let production = products[j];

                    let calculatedRequiredFactories = Math.min(remainingFactories, Math.max(1, Math.floor(factoriesToDistribute / totalPriorityWeight * production.weighting)));
                    let actualRequiredFactories = calculatedRequiredFactories;

                    if (!production.resource.isUseful()) {
                        actualRequiredFactories = 0;
                    }

                    production.cost.forEach(resourceCost => {
                        if (!resourceCost.resource.isUnlocked()) {
                            return;
                        }

                        let previousCost = FactoryManager.currentProduction(production) * resourceCost.quantity;
                        let currentCost = factoryAdjustments[production.id] * resourceCost.quantity;
                        let rate = resourceCost.resource.calculateRateOfChange({buy: true}) + previousCost - currentCost;
                        if (resourceCost.resource.storageRatio < 0.98) {
                            rate -= resourceCost.minRateOfChange;
                        }
                        if (production.resource.isDemanded()) {
                            rate += resourceCost.resource.currentQuantity;
                        }

                        // If we can't afford it (it's above our minimum rate of change) then remove a factory
                        // UNLESS we've got over 80% storage full. In that case lets go wild!
                        if (resourceCost.resource.storageRatio < 0.8){
                            let affordableAmount = Math.floor(rate / resourceCost.quantity);
                            actualRequiredFactories = Math.min(actualRequiredFactories, affordableAmount);
                        }
                        if (!production.resource.isDemanded() && (resourceCost.resource.isDemanded() || resourceCost.resource.storageRatio < settings.productionFactoryMinIngredients)) {
                            actualRequiredFactories = 0;
                        }
                    });

                    // If we're going for bioseed - try to balance neutronium\nanotubes ratio
                    if (settings.prestigeBioseedConstruct && settings.prestigeType === "bioseed" && production === FactoryManager.Productions.NanoTube && resources.Neutronium.currentQuantity < 250) {
                        actualRequiredFactories = 0;
                    }

                    if (actualRequiredFactories > 0){
                        remainingFactories -= actualRequiredFactories;
                        factoryAdjustments[production.id] += actualRequiredFactories;
                    }

                    // We assigned less than wanted, i.e. we either don't need this product, or can't afford it. In both cases - we're done with it.
                    if (actualRequiredFactories < calculatedRequiredFactories) {
                        products.splice(j, 1);
                    }
                }

                if (factoriesToDistribute === remainingFactories) {
                    break;
                }
            }
        }

        // First decrease any production so that we have room to increase others
        for (let production of allProducts) {
            if (factoryAdjustments[production.id] !== undefined) {
                let deltaAdjustments = factoryAdjustments[production.id] - FactoryManager.currentProduction(production);

                if (deltaAdjustments < 0) {
                    FactoryManager.decreaseProduction(production, deltaAdjustments * -1);
                }
            }
        }

        // Increase any production required (if they are 0 then don't do anything with them)
        for (let production of allProducts) {
            if (factoryAdjustments[production.id] !== undefined) {
                let deltaAdjustments = factoryAdjustments[production.id] - FactoryManager.currentProduction(production);

                if (deltaAdjustments > 0) {
                    FactoryManager.increaseProduction(production, deltaAdjustments);
                }
            }
        }
    }

    function autoMiningDroid() {
        // If not unlocked then nothing to do
        if (!DroidManager.initIndustry()) {
            return;
        }

        let allProducts = Object.values(DroidManager.Productions);

        // Init adjustment, and sort groups by priorities
        let priorityGroups = {};
        let factoryAdjustments = {};
        for (let i = 0; i < allProducts.length; i++) {
            let production = allProducts[i];
            if (production.weighting > 0) {
                let priority = production.resource.isDemanded() ? Math.max(production.priority, 100) : production.priority;
                if (priority !== 0) {
                    priorityGroups[priority] = priorityGroups[priority] ?? [];
                    priorityGroups[priority].push(production);
                }
            }
            factoryAdjustments[production.id] = 0;
        }
        let priorityList = Object.keys(priorityGroups).sort((a, b) => b - a).map(key => priorityGroups[key]);
        if (priorityGroups["-1"] && priorityList.length > 1) {
            priorityList.splice(priorityList.indexOf(priorityGroups["-1"], 1));
            priorityList[0].push(...priorityGroups["-1"]);
        }

        // Calculate amount of factories per product
        let remainingFactories = DroidManager.maxOperating();
        for (let i = 0; i < priorityList.length && remainingFactories > 0; i++) {
            let products = priorityList[i];
            while (remainingFactories > 0) {
                let factoriesToDistribute = remainingFactories;
                let totalPriorityWeight = products.reduce((sum, production) => sum + production.weighting, 0);

                for (let j = products.length - 1; j >= 0 && remainingFactories > 0; j--) {
                    let production = products[j];

                    let calculatedRequiredFactories = Math.min(remainingFactories, Math.max(1, Math.floor(factoriesToDistribute / totalPriorityWeight * production.weighting)));
                    let actualRequiredFactories = calculatedRequiredFactories;
                    if (!production.resource.isUseful()) {
                        actualRequiredFactories = 0;
                    }

                    if (actualRequiredFactories > 0){
                        remainingFactories -= actualRequiredFactories;
                        factoryAdjustments[production.id] += actualRequiredFactories;
                    }

                    // We assigned less than wanted, i.e. we either don't need this product, or can't afford it. In both cases - we're done with it.
                    if (actualRequiredFactories < calculatedRequiredFactories) {
                        products.splice(j, 1);
                    }
                }

                if (factoriesToDistribute === remainingFactories) {
                    break;
                }
            }
        }
        if (remainingFactories > 0) {
            return;
        }

        // First decrease any production so that we have room to increase others
        for (let production of allProducts) {
            if (factoryAdjustments[production.id] !== undefined) {
                let deltaAdjustments = factoryAdjustments[production.id] - DroidManager.currentProduction(production);

                if (deltaAdjustments < 0) {
                    DroidManager.decreaseProduction(production, deltaAdjustments * -1);
                }
            }
        }

        // Increase any production required (if they are 0 then don't do anything with them)
        for (let production of allProducts) {
            if (factoryAdjustments[production.id] !== undefined) {
                let deltaAdjustments = factoryAdjustments[production.id] - DroidManager.currentProduction(production);

                if (deltaAdjustments > 0) {
                    DroidManager.increaseProduction(production, deltaAdjustments);
                }
            }
        }
    }

    function autoGraphenePlant() {
        // If not unlocked then nothing to do
        if (!GrapheneManager.initIndustry()) {
            return;
        }

        let remainingPlants = GrapheneManager.maxOperating();

        let sortedFuel = Object.values(GrapheneManager.Fuels).sort((a, b) => b.cost.resource.storageRatio < 0.995 || a.cost.resource.storageRatio < 0.995 ? b.cost.resource.storageRatio - a.cost.resource.storageRatio : b.cost.resource.rateOfChange - a.cost.resource.rateOfChange);
        for (let fuel of sortedFuel) {
            let resource = fuel.cost.resource;

            if (remainingPlants === 0) {
                return;
            }
            if (!resource.isUnlocked()) {
                continue;
            }

            let currentFuelCount = GrapheneManager.fueledCount(fuel);
            let rateOfChange = resource.calculateRateOfChange({buy: true}) + fuel.cost.quantity * GrapheneManager.fueledCount(fuel);
            if (resource.storageRatio < 0.98) {
                rateOfChange -= fuel.cost.minRateOfChange;
            }

            let maxFueledForConsumption = remainingPlants;
            if (resource.storageRatio < 0.8){
                let affordableAmount = Math.floor(rateOfChange / fuel.cost.quantity);
                maxFueledForConsumption = Math.max(Math.min(maxFueledForConsumption, affordableAmount), 0);
            }

            // Only produce graphene above cap if there's working BlackholeMassEjector, otherwise there's no use for excesses for sure, and we don't need to waste fuel
            if (!resources.Graphene.isUseful()) {
                maxFueledForConsumption = 0;
            }

            let deltaFuel = maxFueledForConsumption - currentFuelCount;
            if (deltaFuel !== 0) {
                GrapheneManager.increaseFuel(fuel, deltaFuel);
            }

            remainingPlants -= currentFuelCount + deltaFuel;
        }
    }

    function autoSupply() {
        if (buildings.LakeTransport.stateOnCount < 1 || buildings.LakeBireme.stateOnCount < 1) {
            return;
        }

        let transportAdjustments = {};
        for (let i = 0; i < resourcesBySupplyValue.length; i++) {
            transportAdjustments[resourcesBySupplyValue[i].id] = 0;
        }

        if (resources.Supply.storageRatio < 1) {
            let remaining = buildings.LakeTransport.stateOnCount * 5;
            let keepRatio = 0.975;
            for (let i = 0; i < resourcesBySupplyValue.length; i++) {
                if (remaining <= 0) {
                    break;
                }

                let resource = resourcesBySupplyValue[i];
                if (!resource.supplyEnabled || resource.isDemanded()) {
                    continue;
                }

                let allowedSupply = 0;
                if (resource.isCraftable()) {
                    if (resource.currentQuantity > resource.storageRequired / keepRatio) {
                        allowedSupply = Math.max(0, Math.floor((resource.currentQuantity - (resource.storageRequired / keepRatio)) / resource.supplyVolume));
                    }
                } else {
                    if (resource.storageRatio > keepRatio + 0.01) {
                        allowedSupply = Math.max(1, Math.ceil(resource.calculateRateOfChange({buy: true}) / resource.supplyVolume), Math.ceil((resource.storageRatio - keepRatio) * resource.maxQuantity / resource.supplyVolume));
                    } else if (resource.storageRatio > keepRatio) {
                        allowedSupply = Math.max(0, Math.floor(resource.calculateRateOfChange({buy: true}) / resource.supplyVolume));
                    }
                }
                transportAdjustments[resource.id] = Math.min(remaining, allowedSupply);
                remaining -= transportAdjustments[resource.id];
            }
        }

        let transportDeltas = Object.entries(transportAdjustments).map(([id, adjust]) => ({res: resources[id], delta: adjust - game.global.portal.transport.cargo[id]}));

        transportDeltas.forEach(item => item.delta < 0 && item.res.decreaseSupply(item.delta * -1));
        transportDeltas.forEach(item => item.delta > 0 && item.res.increaseSupply(item.delta));
    }

    // TODO: Add option how to handle each resource: eject when capped, or when excess
    function autoMassEjector() {
        let enabledEjectors = buildings.BlackholeMassEjector.stateOnCount;
        if (enabledEjectors < 1 || haveTask("trash")) {
            return;
        }

        let ejectorAdjustments = {};
        for (let i = 0; i < resourcesByAtomicMass.length; i++) {
            ejectorAdjustments[resourcesByAtomicMass[i].id] = 0;
        }

        let remaining = enabledEjectors * 1000;

        // Eject above ratio
        for (let i = 0; i < resourcesByAtomicMass.length; i++) {
            if (remaining <= 0) {
                break;
            }

            let resource = resourcesByAtomicMass[i];
            if (!resource.ejectEnabled || resource.isDemanded()) {
                continue;
            }

            let keepRatio = enabledEjectors >= settings.prestigeWhiteholeEjectAllCount ? 0.05 : 0.985;
            if (resource === resources.Food && !isHungryRace()) {
                keepRatio = Math.max(keepRatio, 0.25);
            }
            keepRatio = Math.max(keepRatio, resource.requestedQuantity / resource.maxQuantity + 0.01);

            let allowedEject = 0;
            if (resource.isCraftable()) {
                if (resource.currentQuantity > resource.storageRequired / keepRatio) {
                    allowedEject = Math.max(0, Math.floor(resource.currentQuantity - (resource.storageRequired / keepRatio)));
                }
            } else {
                if (resource.storageRatio > keepRatio + 0.01) {
                    allowedEject = Math.max(1, Math.ceil(resource.calculateRateOfChange({buy: true, supply: true})), Math.ceil((resource.storageRatio - keepRatio) * resource.maxQuantity));
                } else if (resource.storageRatio > keepRatio) {
                    allowedEject = Math.max(0, Math.floor(resource.calculateRateOfChange({buy: true, supply: true})));
                }
            }

            ejectorAdjustments[resource.id] = Math.min(remaining, allowedEject);
            remaining -= ejectorAdjustments[resource.id];
        }

        // If we still have some ejectors remaining, let's try to find something else
        if (remaining > 0 && (settings.prestigeWhiteholeEjectExcess || (game.global.race['decay'] && settings.prestigeWhiteholeDecayRate > 0))) {
            for (let i = 0; i < resourcesByAtomicMass.length; i++) {
                if (remaining <= 0) {
                    break;
                }

                let resource = resourcesByAtomicMass[i];
                if (!resource.ejectEnabled || resource.isDemanded()) {
                    continue;
                }

                let ejectableAmount = ejectorAdjustments[resource.id];
                remaining += ejectorAdjustments[resource.id];

                // Decay is tricky. We want to start ejecting as soon as possible... but won't have full storages here. Let's eject x% of decayed amount, unless it's on demand.
                if (game.global.race['decay'] && !resource.isDemanded()) {
                    ejectableAmount = Math.max(ejectableAmount, Math.floor(resource.currentDecay * settings.prestigeWhiteholeDecayRate));
                }

                if (settings.prestigeWhiteholeEjectExcess && resource.storageRequired > 1 && resource.currentQuantity >= resource.storageRequired) {
                    ejectableAmount = Math.max(ejectableAmount, Math.ceil(resource.currentQuantity - resource.storageRequired + resource.calculateRateOfChange({buy: true, sell: true, decay: true, supply: true})));
                }

                ejectorAdjustments[resource.id] = Math.min(remaining, ejectableAmount);
                remaining -= ejectorAdjustments[resource.id];
            }
        }

        let ejectorDeltas = Object.entries(ejectorAdjustments).map(([id, adjust]) => ({res: resources[id], delta: adjust - game.global.interstellar.mass_ejector[id]}));

        ejectorDeltas.forEach(item => item.delta < 0 && item.res.decreaseEjection(item.delta * -1));
        ejectorDeltas.forEach(item => item.delta > 0 && item.res.increaseEjection(item.delta));
    }

    function autoPrestige() {
        if (settings.prestigeWaitAT && game.global.settings.at > 0) {
            return;
        }
        switch (settings.prestigeType) {
            case 'mad':
                let madVue = getVueById("mad");
                if (madVue?.display && haveTech("mad")) {
                    if (state.goal !== 'Reset') {
                        state.goal = 'Reset';
                        return;
                    }
                    if (madVue.armed) {
                        madVue.arm();
                    }

                    if (!settings.prestigeMADWait || (WarManager.currentSoldiers >= WarManager.maxSoldiers && resources.Population.currentQuantity >= resources.Population.maxQuantity && WarManager.currentSoldiers + resources.Population.currentQuantity >= settings.prestigeMADPopulation)) {
                        state.goal = "GameOverMan";
                        madVue.launch();
                    }
                }
                return;
            case 'bioseed':
                if (isBioseederPrestigeAvailable()) { // Ship completed and probe requirements met
                    if (state.goal !== 'Reset') {
                        state.goal = 'Reset';
                        return;
                    }
                    if (buildings.GasSpaceDockLaunch.isUnlocked()) {
                        state.goal = "GameOverMan";
                        buildings.GasSpaceDockLaunch.click();
                    } else if (buildings.GasSpaceDockPrepForLaunch.isUnlocked()) {
                        buildings.GasSpaceDockPrepForLaunch.click();
                    } else {
                        // Open the modal to update the options
                        buildings.GasSpaceDock.cacheOptions();
                    }
                }
                return;
            case 'cataclysm':
                if (isCataclysmPrestigeAvailable()) {
                    if (state.goal !== 'Reset') {
                        state.goal = 'Reset';
                        return;
                    }
                    if (settings.autoEvolution) {
                        loadQueuedSettings(); // Cataclysm doesnt't have evolution stage, so we need to load settings here, before reset
                    }
                    techIds["tech-dial_it_to_11"].click();
                }
                return;
            case 'vacuum':
                // Nothing required
                return;
            case 'whitehole':
                if (isWhiteholePrestigeAvailable()) { // Solar mass requirements met and research available
                    if (state.goal !== 'Reset') {
                        state.goal = 'Reset';
                        return;
                    }
                    ["tech-infusion_confirm", "tech-infusion_check", "tech-exotic_infusion"].forEach(id => techIds[id].click());
                }
                return;
            case 'ascension':
                if (isAscensionPrestigeAvailable()) {
                    if (state.goal !== 'Reset') {
                        state.goal = 'Reset';
                        return;
                    }
                    buildings.SiriusAscend.click();
                }
                return;
            case 'demonic':
                if (isDemonicPrestigeAvailable()) {
                    techIds["tech-demonic_infusion"].click();
                }
                return;
        }
    }

    function isCataclysmPrestigeAvailable() {
        return techIds["tech-dial_it_to_11"].isUnlocked();
    }

    function isBioseederPrestigeAvailable() {
        return buildings.GasSpaceDock.count >= 1 && buildings.GasSpaceDockShipSegment.count >= 100 && buildings.GasSpaceDockProbe.count >= settings.prestigeBioseedProbes;
    }

    function isWhiteholePrestigeAvailable() {
        return getBlackholeMass() >= settings.prestigeWhiteholeMinMass && (techIds["tech-exotic_infusion"].isUnlocked() || techIds["tech-infusion_check"].isUnlocked() || techIds["tech-infusion_confirm"].isUnlocked());
    }

    function isAscensionPrestigeAvailable() {
        return settings.prestigeAscensionSkipCustom && buildings.SiriusAscend.isUnlocked() && isPillarFinished();
    }

    function isDemonicPrestigeAvailable() {
        return buildings.SpireTower.count > settings.prestigeDemonicFloor && haveTech("waygate", 3) && (!settings.autoMech || (!MechManager.isActive && MechManager.mechsPotential <= settings.prestigeDemonicPotential)) && techIds["tech-demonic_infusion"].isUnlocked();
    }

    function isPillarFinished() {
        return !settings.prestigeAscensionPillar || game.global.race.universe === 'micro' || game.global.pillars[game.global.race.species] >= game.alevel();
    }

    function getBlackholeMass() {
        let engine = game.global.interstellar.stellar_engine;
        return engine ? engine.mass + engine.exotic : 0;
    }

    function autoAssembleGene() {
        if (!settings.genesAssembleGeneAlways && haveTech("genetics", 7)) {
            return;
        }

        // If we haven't got the assemble gene button or don't have full knowledge then return
        if (!haveTech("genetics", 6) || resources.Knowledge.currentQuantity < 200000) {
            return;
        }

        let nextTickKnowledge = resources.Knowledge.currentQuantity + resources.Knowledge.rateOfChange * gameTicksPerSecond("mid");
        let overflowKnowledge = nextTickKnowledge - resources.Knowledge.maxQuantity;
        if (overflowKnowledge < 0) {
            return;
        }

        let vue = getVueById("arpaSequence");
        if (vue === undefined) { return false; }


        let genesToAssemble = Math.ceil(overflowKnowledge / 200000);
        if (genesToAssemble > 0) {
            resetMultiplier();
            for (let i = 0; i < genesToAssemble; i++) {
                vue.novo();
                resources.Knowledge.currentQuantity -= 200000;
                resources.Genes.currentQuantity += 1;
            }
        }
    }

    function autoMarket(bulkSell, ignoreSellRatio) {
        if (!MarketManager.isUnlocked()) {
            return;
        }

        adjustTradeRoutes();

        // Manual trade disabled
        if (game.global.race['no_trade']) {
            return;
        }

        let minimumMoneyAllowed = settings.minimumMoneyPercentage > 0 ? resources.Money.maxQuantity * settings.minimumMoneyPercentage / 100 : settings.minimumMoney;

        let currentMultiplier = MarketManager.multiplier; // Save the current multiplier so we can reset it at the end of the function
        let maxMultiplier = MarketManager.getMaxMultiplier();

        for (let i = 0; i < MarketManager.priorityList.length; i++) {
            let resource = MarketManager.priorityList[i];

            if (!resource.isTradable() || !resource.isUnlocked() || !MarketManager.isBuySellUnlocked(resource)) {
                continue;
            }

            if ((resource.autoSellEnabled && (ignoreSellRatio || resource.storageRatio > resource.autoSellRatio)) || resource.storageRatio === 1) {
                let maxAllowedTotalSellPrice = resources.Money.maxQuantity - resources.Money.currentQuantity;
                let unitSellPrice = MarketManager.getUnitSellPrice(resource);
                let maxAllowedUnits = Math.floor(maxAllowedTotalSellPrice / unitSellPrice); // only sell up to our maximum money

                if (resource.storageRatio > resource.autoSellRatio) {
                    maxAllowedUnits = Math.min(maxAllowedUnits, Math.floor(resource.currentQuantity - (resource.autoSellRatio * resource.maxQuantity))); // If not full sell up to our sell ratio
                } else {
                    maxAllowedUnits = Math.min(maxAllowedUnits, Math.floor(resource.calculateRateOfChange({all: true}) * 2)); // If resource is full then sell up to 2 seconds worth of production
                }

                if (maxAllowedUnits <= maxMultiplier) {
                    // Our current max multiplier covers the full amount that we want to sell
                    MarketManager.setMultiplier(maxAllowedUnits);
                    MarketManager.sell(resource);
                } else {
                    // Our current max multiplier doesn't cover the full amount that we want to sell. Sell up to 5 batches.
                    let counter = Math.min(5, Math.floor(maxAllowedUnits / maxMultiplier)); // Allow up to 5 sales per script loop
                    MarketManager.setMultiplier(maxMultiplier);

                    for (let j = 0; j < counter; j++) {
                        MarketManager.sell(resource);
                    }
                }
            }

            if (bulkSell === true) {
                continue;
            }

            if (resource.autoBuyEnabled === true && resource.storageRatio < resource.autoBuyRatio && !resources.Money.isDemanded()) {
                let storableAmount = Math.floor((resource.autoBuyRatio - resource.storageRatio) * resource.maxQuantity);
                let affordableAmount = Math.floor((resources.Money.currentQuantity - minimumMoneyAllowed) / MarketManager.getUnitBuyPrice(resource));
                let maxAllowedUnits = Math.min(storableAmount, affordableAmount);
                if (maxAllowedUnits > 0) {
                    if (maxAllowedUnits <= maxMultiplier){
                        MarketManager.setMultiplier(maxAllowedUnits);
                        MarketManager.buy(resource);
                    } else {
                        let counter = Math.min(5, Math.floor(maxAllowedUnits / maxMultiplier));
                        MarketManager.setMultiplier(maxMultiplier);

                        for (let j = 0; j < counter; j++) {
                            MarketManager.buy(resource);
                        }
                    }
                }
            }
        }

        MarketManager.setMultiplier(currentMultiplier); // Reset multiplier
    }

    function autoGalaxyMarket() {
        // If not unlocked then nothing to do
        if (!GalaxyTradeManager.initIndustry()) {
            return;
        }

         // Init adjustment, and sort groups by priorities
        let priorityGroups = {};
        let tradeAdjustments = {};
        for (let i = 0; i < poly.galaxyOffers.length; i++) {
            let trade = poly.galaxyOffers[i];
            let buyResource = resources[trade.buy.res];
            if (buyResource.galaxyMarketWeighting > 0) {
                let priority = buyResource.isDemanded() ? Math.max(buyResource.galaxyMarketPriority, 100) : buyResource.galaxyMarketPriority;
                if (priority !== 0) {
                    priorityGroups[priority] = priorityGroups[priority] ?? [];
                    priorityGroups[priority].push(trade);
                }
            }
            tradeAdjustments[buyResource.id] = 0;
        }
        let priorityList = Object.keys(priorityGroups).sort((a, b) => b - a).map(key => priorityGroups[key]);
        if (priorityGroups["-1"] && priorityList.length > 1) {
            priorityList.splice(priorityList.indexOf(priorityGroups["-1"], 1));
            priorityList[0].push(...priorityGroups["-1"]);
        }

        // Calculate amount of factories per product
        let remainingFreighters = GalaxyTradeManager.maxOperating();
        for (let i = 0; i < priorityList.length && remainingFreighters > 0; i++) {
            let trades = priorityList[i];
            while (remainingFreighters > 0) {
                let freightersToDistribute = remainingFreighters;
                let totalPriorityWeight = trades.reduce((sum, trade) => sum + resources[trade.buy.res].galaxyMarketWeighting, 0);

                for (let j = trades.length - 1; j >= 0 && remainingFreighters > 0; j--) {
                    let trade = trades[j];
                    let buyResource = resources[trade.buy.res];
                    let sellResource = resources[trade.sell.res];

                    let calculatedRequiredFreighters = Math.min(remainingFreighters, Math.max(1, Math.floor(freightersToDistribute / totalPriorityWeight * buyResource.galaxyMarketWeighting)));
                    let actualRequiredFreighters = calculatedRequiredFreighters;
                    if (!buyResource.isUseful() || sellResource.isDemanded() || sellResource.storageRatio < settings.productionFactoryMinIngredients) {
                        actualRequiredFreighters = 0;
                    }

                    if (actualRequiredFreighters > 0){
                        remainingFreighters -= actualRequiredFreighters;
                        tradeAdjustments[buyResource.id] += actualRequiredFreighters;
                    }

                    // We assigned less than wanted, i.e. we either don't need this product, or can't afford it. In both cases - we're done with it.
                    if (actualRequiredFreighters < calculatedRequiredFreighters) {
                        trades.splice(j, 1);
                    }
                }

                if (freightersToDistribute === remainingFreighters) {
                    break;
                }
            }
        }

        let tradeDeltas = poly.galaxyOffers.map((trade, index) => tradeAdjustments[trade.buy.res] - GalaxyTradeManager.currentProduction(index));

        // TODO: Add GalaxyTradeManager.zeroProduction() to save some clicks.
        tradeDeltas.forEach((value, index) => value < 0 && GalaxyTradeManager.decreaseProduction(index, value * -1));
        tradeDeltas.forEach((value, index) => value > 0 && GalaxyTradeManager.increaseProduction(index, value));
    }

    function autoGatherResources() {
        // Don't spam click once we've got a bit of population going
        if (!settings.buildingAlwaysClick && resources.Population.currentQuantity > 15 && (buildings.RockQuarry.count > 0 || game.global.race['sappy'])) {
            return;
        }

        // Uses exposed action handlers, bypassing vue - they much faster, and that's important with a lot of calls
        let resPerClick = getResourcesPerClick();
        let amount = 0;
        if (buildings.Food.isClickable()){
            if (haveTech("conjuring", 1)) {
                amount = Math.floor(Math.min((resources.Food.maxQuantity - resources.Food.currentQuantity) / (resPerClick * 10), resources.Mana.currentQuantity, settings.buildingClickPerTick));
                resources.Mana.currentQuantity -= amount;
                resources.Food.currentQuantity += amount * resPerClick;
            } else {
                amount = Math.ceil(Math.min((resources.Food.maxQuantity - resources.Food.currentQuantity) / resPerClick, settings.buildingClickPerTick));
                resources.Food.currentQuantity = Math.min(resources.Food.currentQuantity + amount * resPerClick, resources.Food.maxQuantity);
            }
            let food = game.actions.city.food;
            for (let i = 0; i < amount; i++) {
                food.action();
            }
        }
        if (buildings.Lumber.isClickable()){
            if (haveTech("conjuring", 2)) {
                amount = Math.floor(Math.min((resources.Lumber.maxQuantity - resources.Lumber.currentQuantity) / (resPerClick * 10), resources.Mana.currentQuantity, settings.buildingClickPerTick));
                resources.Mana.currentQuantity -= amount;
                resources.Lumber.currentQuantity += amount * resPerClick;
            } else {
                amount = Math.ceil(Math.min((resources.Lumber.maxQuantity - resources.Lumber.currentQuantity) / resPerClick, settings.buildingClickPerTick));
                resources.Lumber.currentQuantity = Math.min(resources.Lumber.currentQuantity + amount * resPerClick, resources.Lumber.maxQuantity);
            }
            let lumber = game.actions.city.lumber;
            for (let i = 0; i < amount; i++) {
                lumber.action();
            }
        }
        if (buildings.Stone.isClickable()){
            if (haveTech("conjuring", 2)) {
                amount = Math.floor(Math.min((resources.Stone.maxQuantity - resources.Stone.currentQuantity) / (resPerClick * 10), resources.Mana.currentQuantity, settings.buildingClickPerTick));
                resources.Mana.currentQuantity -= amount;
                resources.Stone.currentQuantity += amount * resPerClick;
            } else {
                amount = Math.ceil(Math.min((resources.Stone.maxQuantity - resources.Stone.currentQuantity) / resPerClick, settings.buildingClickPerTick));
                resources.Stone.currentQuantity = Math.min(resources.Stone.currentQuantity + amount * resPerClick, resources.Stone.maxQuantity);
            }
            let stone = game.actions.city.stone;
            for (let i = 0; i < amount; i++) {
                stone.action();
            }
        }
        if (buildings.Chrysotile.isClickable()){
            if (haveTech("conjuring", 2)) {
                amount = Math.floor(Math.min((resources.Chrysotile.maxQuantity - resources.Chrysotile.currentQuantity) / (resPerClick * 10), resources.Mana.currentQuantity, settings.buildingClickPerTick));
                resources.Mana.currentQuantity -= amount;
                resources.Chrysotile.currentQuantity += amount * resPerClick;
            } else {
                amount = Math.ceil(Math.min((resources.Chrysotile.maxQuantity - resources.Chrysotile.currentQuantity) / resPerClick, settings.buildingClickPerTick));
                resources.Chrysotile.currentQuantity = Math.min(resources.Chrysotile.currentQuantity + amount * resPerClick, resources.Chrysotile.maxQuantity);
            }
            let chrysotile = game.actions.city.chrysotile;
            for (let i = 0; i < amount; i++) {
                chrysotile.action();
            }
        }
        if (buildings.Slaughter.isClickable()){
            amount = Math.min(Math.max(resources.Lumber.maxQuantity - resources.Lumber.currentQuantity, resources.Food.maxQuantity - resources.Food.currentQuantity, resources.Furs.maxQuantity - resources.Furs.currentQuantity) / resPerClick, settings.buildingClickPerTick);
            let slaughter = game.actions.city.slaughter;
            for (let i = 0; i < amount; i++) {
                slaughter.action();
            }
            resources.Lumber.currentQuantity = Math.min(resources.Lumber.currentQuantity + amount * resPerClick, resources.Lumber.maxQuantity);
            if (game.global.race['soul_eater'] && haveTech("primitive")){
                resources.Food.currentQuantity = Math.min(resources.Food.currentQuantity + amount * resPerClick, resources.Food.maxQuantity);
            }
            if (resources.Furs.isUnlocked()) {
                resources.Furs.currentQuantity = Math.min(resources.Furs.currentQuantity + amount * resPerClick, resources.Furs.maxQuantity);
            }
        }
    }

    function autoBuild() {
        BuildingManager.updateWeighting();
        ProjectManager.updateWeighting();

        // TODO: Build world collider faster than level per second
        // Check for active build triggers, and click if possible
        for (let i = 0; i < state.triggerTargets.length; i++) {
            let building = state.triggerTargets[i];
            if (building instanceof Action && building.click() && building.consumption.length > 0) {
                return;
            }
        }

        let ignoredList = [...state.queuedTargets, ...state.triggerTargets];
        let buildingList = [...BuildingManager.managedPriorityList(), ...ProjectManager.managedPriorityList()];

        // Sort array so we'll have prioritized buildings on top. We'll need that below to avoid deathlocks, when building 1 waits for building 2, and building 2 waits for building 3. That's something we don't want to happen when building 1 and building 3 doesn't conflicts with each other.
        state.otherTargets = buildingList.sort((a, b) => b.weighting - a.weighting);

        let estimatedTime = {};
        let affordableCache = {};
        const isAffordable = (building) => (affordableCache[building._vueBinding] ?? (affordableCache[building._vueBinding] = building.isAffordable()));

        // Loop through the auto build list and try to buy them
        buildingsLoop:
        for (let i = 0; i < buildingList.length; i++) {
            let building = buildingList[i];

            // Only go further if it's affordable building, and not current target
            if (ignoredList.includes(building) || !isAffordable(building)) {
                continue;
            }

            // Check queue and trigger conflicts
            let conflict = getCostConflict(building);
            if (conflict) {
                building.extraDescription += `Conflicts with ${conflict.target.title} for ${conflict.res.name} (${conflict.cause})<br>`;
                continue;
            }

            // Checks weights, if this building doesn't demands any overflowing resources(unless we ignoring overflowing)
            if (!settings.buildingBuildIfStorageFull || !building.resourceRequirements.some(requirement => requirement.resource.storageRatio > 0.98)) {
                for (let j = 0; j < buildingList.length; j++) {
                    let other = buildingList[j];
                    let weightDiffRatio = other.weighting / building.weighting;

                    // Buildings sorted by weighting, so once we reached something with lower weighting - all remaining also lower, and we don't care about them
                    if (weightDiffRatio <= 1) {
                        break;
                    }
                    // And we don't want to process clickable buildings - all buildings with highter weighting should already been proccessed.
                    // If that thing is affordable, but wasn't bought - it means something block it, and it won't be builded soon anyway, so we'll ignore it's demands.
                    // Unless that thing have x10 weight, and we absolutely don't want to waste its resources
                    if (weightDiffRatio < 10 && isAffordable(other)){
                        continue;
                    }

                    // Calculate time to build for competing building, if it's not cached
                    if (!estimatedTime[other._vueBinding]){
                        estimatedTime[other._vueBinding] = [];

                        for (let k = 0; k < other.resourceRequirements.length; k++) {
                            let resource = other.resourceRequirements[k].resource;
                            let quantity = other.resourceRequirements[k].quantity;

                            // Ignore locked
                            if (!resource.isUnlocked()) {
                                continue;
                            }

                            let totalRateOfCharge = resource.calculateRateOfChange({buy: true});
                            if (totalRateOfCharge > 0) {
                                estimatedTime[other._vueBinding][resource.id] = (quantity - resource.currentQuantity) / totalRateOfCharge;
                            } else if (settings.buildingsIgnoreZeroRate && resource.storageRatio < 0.975 && resource.currentQuantity < quantity) {
                                estimatedTime[other._vueBinding][resource.id] = Number.MAX_SAFE_INTEGER;
                            } else {
                                // Craftables and such, which not producing at this moment. We can't realistically calculate how much time it'll take to fulfil requirement(too many factors), so let's assume we can get it any any moment.
                                estimatedTime[other._vueBinding][resource.id] = 0;
                            }
                        }
                        estimatedTime[other._vueBinding].total = Math.max(0, ...Object.values(estimatedTime[other._vueBinding]));
                    }

                    // Compare resource costs
                    for (let k = 0; k < building.resourceRequirements.length; k++) {
                        let thisRequirement = building.resourceRequirements[k];
                        let resource = thisRequirement.resource;

                        // Ignore locked and capped resources
                        if (!resource.isUnlocked() || resource.isCapped()){
                            continue;
                        }

                        // Check if we're actually conflicting on this resource
                        let otherRequirement = other.resourceRequirements.find(resourceRequirement => resourceRequirement.resource === resource);
                        if (otherRequirement === undefined){
                            continue;
                        }

                        // We have enought resources for both buildings, no need to preserve it
                        if (resource.currentQuantity >= (otherRequirement.quantity + thisRequirement.quantity)) {
                            continue;
                        }

                        // We can use up to this amount of resources without delaying competing building
                        // Not very accurate, as income can fluctuate wildly for foundry, factory, and such, but should work as bottom line
                        if (thisRequirement.quantity <= (estimatedTime[other._vueBinding].total - estimatedTime[other._vueBinding][resource.id]) * resource.calculateRateOfChange({buy: true})) {
                            continue;
                        }

                        // Check if cost difference is below weighting threshold, so we won't wait hours for 10x amount of resources when weight is just twice higher
                        let costDiffRatio = otherRequirement.quantity / thisRequirement.quantity;
                        if (costDiffRatio >= weightDiffRatio) {
                            continue;
                        }

                        // If we reached here - then we want to delay with our current building. Return all way back to main loop, and try to build something else
                        building.extraDescription += `Conflicts with ${other.title} for ${resource.name}<br>`;
                        continue buildingsLoop;
                    }
                }
            }

            // Build building
            if (building.click()) {
                if (building.consumption.length > 0) { // Only one building with consumption per tick, so we won't build few red buildings having just 1 extra support, and such
                    return;
                }
                // Mark all processed building as unaffordable for remaining loop, so they won't appear as conflicting
                for (let key in affordableCache) {
                    affordableCache[key] = false;
                }
            }
        }
    }

    function isTechAllowed(tech) {
        let itemId = tech._vueBinding;

        // Skip ignored techs
        if (settings.researchIgnore.includes(itemId)) {
            return false;
        }

        // Save soul gems for reset
        if (settings.prestigeWhiteholeSaveGems && settings.prestigeType === "whitehole") {
            let gemsCost = resourceCost(tech, resources.Soul_Gem);
            if (gemsCost > 0 && resources.Soul_Gem.currentQuantity - gemsCost < 10) {
                return false;
            }
        }

        // Don't click any reset options without user consent... that would be a dick move, man.
        if (itemId === "tech-exotic_infusion" || itemId === "tech-infusion_check" || itemId === "tech-infusion_confirm" ||
            itemId === "tech-dial_it_to_11" || itemId === "tech-limit_collider" || itemId === "tech-demonic_infusion") {
            return false;
        }

        // Don't use Dark Bomb if not enabled
        if (itemId == "tech-dark_bomb" && !settings.prestigeDemonicBomb) {
            return false;
        }

        // Don't waste phage and plasmid on ascension techs if we're not going there
        if ((itemId === "tech-incorporeal" || itemId === "tech-tech_ascension") && settings.prestigeType !== "ascension") {
            return false;
        }

        // Alien Gift
        if (itemId === "tech-xeno_gift" && resources.Knowledge.maxQuantity < settings.fleetAlienGiftKnowledge) {
            return false;
        }

        // Unification
        if ((itemId === "tech-unification2" || itemId === "tech-unite") && !settings.foreignUnification) {
            return false;
        }

        // If user wants to stabilize blackhole then do it, unless we're on blackhole run
        if (itemId === "tech-stabilize_blackhole" && (!settings.prestigeWhiteholeStabiliseMass || settings.prestigeType === "whitehole")) {
            return false;
        }

        if (itemId !== settings.userResearchTheology_1) {
            const isFanatRace = () => Object.values(fanatAchievements).reduce((result, combo) => result || (game.global.race.species === combo.race && game.global.race.gods === combo.god && !isAchievementUnlocked(combo.achieve, game.alevel())), false);
            if (itemId === "tech-anthropology" && !(settings.userResearchTheology_1 === "auto" && settings.prestigeType === "mad" && !isFanatRace())) {
                return false;
            }
            if (itemId === "tech-fanaticism" && !(settings.userResearchTheology_1 === "auto" && (settings.prestigeType !== "mad" || isFanatRace()))) {
                return false;
            }
        }

        if (itemId !== settings.userResearchTheology_2) {
            if (itemId === "tech-deify" && !(settings.userResearchTheology_2 === "auto" && (settings.prestigeType === "ascension" || settings.prestigeType === "demonic"))) {
                return false;
            }
            if (itemId === "tech-study" && !(settings.userResearchTheology_2 === "auto" && settings.prestigeType !== "ascension" && settings.prestigeType !== "demonic")) {
                return false;
            }
        }
        return true;
    }

    function autoResearch() {
        let items = $('#tech .action:not(.cna)');

        // Check if we have something researchable
        if (items.length === 0){
            return;
        }

        // Check for active triggers, and click if possible
        for (let i = 0; i < state.triggerTargets.length; i++) {
            let tech = state.triggerTargets[i];
            if (tech instanceof Technology && tech.click()) {
                BuildingManager.updateBuildings();
                ProjectManager.updateProjects();
                return;
            }
        }

        for (let i = 0; i < items.length; i++) {
            let tech = techIds[items[i].id];
            if (isTechAllowed(tech) && !getCostConflict(tech) && tech.click()) {
                BuildingManager.updateBuildings(); // Cache cost if we just unlocked some building
                ProjectManager.updateProjects();
                return;
            }
        }
    }

    function getCitadelConsumption(amount) {
        return (30 + (amount - 1) * 2.5) * amount * (game.global.race['emfield'] ? 1.5 : 1);
    }

    function isHellSupressUseful() {
        return jobs.Archaeologist.count > 0 || jobs.Scarletite.count > 0 || buildings.RuinsArcology.stateOnCount > 0 || buildings.GateInferniteMine.stateOnCount > 0;
    }

    function autoPower() {
        // Only start doing this once power becomes available. Isn't useful before then
        if (!resources.Power.isUnlocked()) {
            return;
        }
        // TODO: Belt support is messy on first tick, due to empty maxSpaceMiners. That's a monkey patch to work it around. Fix me properly.
        if (state.scriptTick < 3) {
            resources.Belt_Support.updateData();
        }

        let buildingList = BuildingManager.managedStatePriorityList();

        // No buildings unlocked yet
        if (buildingList.length === 0) {
            return;
        }

        // Calculate the available power / resource rates of change that we have to work with
        let availablePower = resources.Power.currentQuantity;

        for (let i = 0; i < buildingList.length; i++) {
            let building = buildingList[i];

            availablePower += (building.powered * building.stateOnCount);

            for (let j = 0; j < building.consumption.length; j++) {
                let resourceType = building.consumption[j];

                // Fuel adjust
                let consumptionRate = resourceType.rate;
                if (building._tab === "space" && (resourceType.resource === resources.Oil || resourceType.resource === resources.Helium_3)) {
                    consumptionRate = game.fuel_adjust(consumptionRate, true);
                }
                if ((building._tab === "interstellar" || building._tab === "galaxy") && (resourceType.resource === resources.Deuterium || resourceType.resource === resources.Helium_3) && building !== buildings.AlphaFusion) {
                    consumptionRate = game.int_fuel_adjust(consumptionRate);
                }

                // Just like for power, get our total resources available
                if (building === buildings.BeltSpaceStation && resourceType.resource === resources.Belt_Support) {
                    resources.Belt_Support.rateOfChange -= resources.Belt_Support.maxQuantity;
                } else {
                    resourceType.resource.rateOfChange += consumptionRate * building.stateOnCount;
                }
            }
        }

        let manageTransport = buildings.LakeTransport.isSmartManaged() && buildings.LakeBireme.isSmartManaged();
        let manageSpire = buildings.SpirePort.isSmartManaged() && buildings.SpireBaseCamp.isSmartManaged();



        //
        //
        //          Add smart management
        //
        //

        let depotStateOn = 0;
        let containerStateOn = 0;
        if ((buildings.DwarfEleriumContainer.count > 0 && buildings.DwarfEleriumContainer.isSmartManaged()) || (buildings.StargateDepot.count > 0 && buildings.StargateDepot.isSmartManaged())) {
            let container = getStorage("Elerium", buildings.DwarfEleriumContainer, "space_dwarf_elerium_contain_title", true);
            let depot = getStorage("Elerium", buildings.StargateDepot, "galaxy_gateway_depot", true);

            let baseElerium = resources.Elerium.maxQuantity - (container * buildings.DwarfEleriumContainer.stateOnCount) - (depot * buildings.StargateDepot.stateOnCount);
            let maxElerium = resources.Elerium.maxQuantity + (container * buildings.DwarfEleriumContainer.stateOffCount) + (depot * buildings.StargateDepot.stateOffCount);
            let maxAffordable = Math.max.apply(Math, state.eleriumCosts.filter(cost => cost <= maxElerium));

            depotStateOn = Math.min(buildings.StargateDepot.count, Math.max(0, Math.ceil((maxAffordable - baseElerium) / depot)));
            containerStateOn = Math.min(buildings.DwarfEleriumContainer.count, Math.max(0, Math.ceil((maxAffordable - (baseElerium + depot * depotStateOn)) / container)));
        }

        // Start assigning buildings from the top of our priority list to the bottom
        for (let i = 0; i < buildingList.length; i++) {
            let building = buildingList[i];
            let maxStateOn = building.count;
            let currentStateOn = building.stateOnCount;

            // Max powered amount
            if (building === buildings.NeutronCitadel) {
                while (maxStateOn > 0) {
                    if (availablePower >= getCitadelConsumption(maxStateOn)) {
                        break;
                    } else {
                        maxStateOn--;
                    }
                }
            } else if (building.powered > 0) {
                maxStateOn = Math.min(maxStateOn, availablePower / building.powered);
            }

            if (building === buildings.StargateDepot) {
                maxStateOn = Math.min(maxStateOn, depotStateOn);
            }

            if (building === buildings.DwarfEleriumContainer) {
                maxStateOn = Math.min(maxStateOn, containerStateOn);
            }

            // Ascension Trigger info
            if (building === buildings.SiriusAscensionTrigger && availablePower < building.powered) {
                building.extraDescription = `Missing ${Math.ceil(building.powered - availablePower)} MW to power on<br>${building.extraDescription}`;
            }

            if (building.is.smart && building.autoStateSmart) {
                // Spire managed separately
                if (manageSpire && (building === buildings.SpirePort || building === buildings.SpireBaseCamp || building === buildings.SpireMechBay)) {
                    continue;
                }
                // Lake transport managed separately
                if (manageTransport && (building === buildings.LakeTransport || building === buildings.LakeBireme)) {
                    continue;
                }
                if (resources.Power.currentQuantity <= resources.Power.maxQuantity) { // Saving power, unless we can afford everything
                    // Disable Belt Space Stations with no workers
                    if (building === buildings.BeltSpaceStation && game.breakdown.c.Elerium) {
                        let stationStorage = parseFloat(game.breakdown.c.Elerium[game.loc("space_belt_station_title")] ?? 0);
                        let extraStations = Math.floor((resources.Elerium.maxQuantity - resources.Elerium.storageRequired) / stationStorage);
                        let minersNeeded = buildings.BeltEleriumShip.stateOnCount * 2 + buildings.BeltIridiumShip.stateOnCount + buildings.BeltIronShip.stateOnCount;
                        maxStateOn = Math.min(maxStateOn, Math.max(currentStateOn - extraStations, Math.ceil(minersNeeded / 3)));
                    }
                    if (building === buildings.CementPlant && jobs.CementWorker.count === 0) {
                        maxStateOn = 0;
                    }
                    if (building === buildings.Mine && jobs.Miner.count === 0) {
                        maxStateOn = 0;
                    }
                    if (building === buildings.CoalMine && jobs.CoalMiner.count === 0) {
                        maxStateOn = 0;
                    }
                    if (building === buildings.GasMining && !resources.Helium_3.isUseful()) {
                        maxStateOn = Math.min(maxStateOn, resources.Helium_3.getBusyWorkers("space_gas_mining_title", currentStateOn));
                    }
                    if (building === buildings.GasMoonOilExtractor  && !resources.Oil.isUseful()) {
                        maxStateOn = Math.min(maxStateOn, resources.Oil.getBusyWorkers("space_gas_moon_oil_extractor_title", currentStateOn));
                    }
                    // Enable cooling towers only if we can power at least two harbours
                    if (building === buildings.LakeCoolingTower && availablePower < (building.powered * maxStateOn + ((500 * 0.92 ** maxStateOn) * (game.global.race['emfield'] ? 1.5 : 1)).toFixed(2) * Math.min(2, buildings.LakeHarbour.count))) {
                        maxStateOn = 0;
                    }
                    // Don't bother powering harbour if we have power for only one
                    if (building === buildings.LakeHarbour && maxStateOn === 1 && building.count > 1) {
                        maxStateOn = 0;
                    }
                }
                // Do not enable Ascension Machine whire we're waiting for pillar
                //if (building === buildings.SiriusAscensionTrigger && !isPillarFinished()) {
                //     maxStateOn = 0;currentStateOn
                //}maxStateOn = currentStateOn;
                if (building === buildings.SiriusAscensionTrigger) {
                    maxStateOn = currentStateOn;
                }

                // Disable barracks on bioseed run, if enabled
                if (building === buildings.Barracks && settings.prestigeEnabledBarracks < 100 && !WarManager.isForeignUnlocked() && buildings.GasSpaceDockShipSegment.count < 90 && buildings.DwarfWorldController.count < 1) {
                    maxStateOn = Math.ceil(maxStateOn * settings.prestigeEnabledBarracks / 100);
                }
                // Max attractors configured by autoHell
                if (building === buildings.BadlandsAttractor && settings.autoHell) {
                    let attractorAdjust = currentStateOn;
                    if (currentStateOn > WarManager.hellAttractorMax) {
                        attractorAdjust--;
                    }
                    if (currentStateOn < WarManager.hellAttractorMax) {
                        attractorAdjust++;
                    }
                    maxStateOn = Math.min(maxStateOn, attractorAdjust);
                }
                // Disable tourist center with full money
                if (building === buildings.TouristCenter && !isHungryRace() && resources.Food.storageRatio < 0.7 && !resources.Money.isUseful()) {
                    maxStateOn = Math.min(maxStateOn, resources.Money.getBusyWorkers("tech_tourism", currentStateOn));
                }
                // Disable mills with surplus energy
                if (building === buildings.Mill && building.powered && resources.Food.storageRatio < 0.7 && (jobs.Farmer.count > 0 || jobs.Hunter.count > 0)) {
                    maxStateOn = Math.min(maxStateOn, currentStateOn - ((resources.Power.currentQuantity - 5) / (-building.powered)));
                }
                // Disable useless Mine Layers
                if (building === buildings.ChthonianMineLayer) {
                    if (buildings.ChthonianRaider.stateOnCount === 0 && buildings.ChthonianExcavator.stateOnCount === 0) {
                        maxStateOn = 0;
                    } else {
                        let mineAdjust = ((game.global.race['instinct'] ? 7000 : 7500) - poly.piracy("gxy_chthonian")) / game.actions.galaxy.gxy_chthonian.minelayer.ship.rating();
                        maxStateOn = Math.min(maxStateOn, currentStateOn + Math.ceil(mineAdjust));
                    }
                }
                // Disable useless Guard Post
                if (building === buildings.RuinsGuardPost) {
                    if (isHellSupressUseful()) {
                        let postRating = game.armyRating(1, "hellArmy", 0) * (game.global.race['holy'] ? 1.25 : 1);
                        // 1 extra power to compensate rounding errors, 100 extra to compensate heling drinf of rage races
                        let postAdjust = ((game.global.race['rage'] ? 5100 : 5001) - poly.hellSupression("ruins").rating) / postRating;
                        if (haveTech('hell_gate')) {
                            postAdjust = Math.max(postAdjust, ((game.global.race['rage'] ? 7600 : 7501) - poly.hellSupression("gate").rating) / postRating);
                        }
                        // We're reserving just one soldier for Guard Posts, so let's increase them by 1
                        maxStateOn = Math.min(maxStateOn, currentStateOn + 1, currentStateOn + Math.ceil(postAdjust));
                    } else {
                        maxStateOn = 0;
                    }
                }
                // Disable Waygate once it cleared, or if we're going to use bomb, or current potential is too hight
                if (building === buildings.SpireWaygate && (settings.prestigeDemonicBomb || haveTech("waygate", 3) || (settings.autoMech && MechManager.mechsPotential > settings.mechWaygatePotential && (settings.prestigeType !== "demonic" || buildings.SpireTower.count < settings.prestigeDemonicFloor)))) {
                      maxStateOn = 0;
                }
                // Once we unlocked Embassy - we don't need scouts and corvettes until we'll have piracy. Let's freeup support for more Bolognium ships
                if ((building === buildings.ScoutShip || building === buildings.CorvetteShip) && !game.global.tech.piracy && buildings.GorddonEmbassy.isUnlocked()) {
                    maxStateOn = 0;
                }
                // Production buildings with capped resources
                // TODO: Disable elerium and iridium ships when obsolete
                if (building === buildings.BeltEleriumShip && !resources.Elerium.isUseful()) {
                    maxStateOn = Math.min(maxStateOn, resources.Elerium.getBusyWorkers("job_space_miner", currentStateOn));
                }
                if (building === buildings.BeltIridiumShip && !resources.Iridium.isUseful()) {
                    maxStateOn = Math.min(maxStateOn, resources.Iridium.getBusyWorkers("job_space_miner", currentStateOn));
                }
                if (building === buildings.BeltIronShip && !resources.Iron.isUseful()) {
                    maxStateOn = Math.min(maxStateOn, resources.Iron.getBusyWorkers("job_space_miner", currentStateOn));
                }
                if (building === buildings.BologniumShip && !resources.Bolognium.isUseful()) {
                    maxStateOn = Math.min(maxStateOn, resources.Bolognium.getBusyWorkers("galaxy_bolognium_ship", currentStateOn));
                }
                if (building === buildings.Alien1VitreloyPlant && !resources.Vitreloy.isUseful()) {
                    maxStateOn = Math.min(maxStateOn, resources.Vitreloy.getBusyWorkers("galaxy_vitreloy_plant_bd", currentStateOn));
                }
                if (building === buildings.Alien2ArmedMiner && !resources.Bolognium.isUseful() && !resources.Adamantite.isUseful() && !resources.Iridium.isUseful()) {
                    let minShips = Math.max(resources.Bolognium.getBusyWorkers("galaxy_armed_miner_bd", currentStateOn),
                                            resources.Adamantite.getBusyWorkers("galaxy_armed_miner_bd", currentStateOn),
                                            resources.Iridium.getBusyWorkers("galaxy_armed_miner_bd", currentStateOn));
                    maxStateOn = Math.min(maxStateOn, minShips);
                }
                if (building === buildings.ChthonianRaider && !resources.Vitreloy.isUseful() && !resources.Polymer.isUseful() && !resources.Neutronium.isUseful() && !resources.Deuterium.isUseful()) {
                    let minShips = Math.max(resources.Vitreloy.getBusyWorkers("galaxy_raider", currentStateOn),
                                            resources.Polymer.getBusyWorkers("galaxy_raider", currentStateOn),
                                            resources.Neutronium.getBusyWorkers("galaxy_raider", currentStateOn),
                                            resources.Deuterium.getBusyWorkers("galaxy_raider", currentStateOn));
                    maxStateOn = Math.min(maxStateOn, minShips);
                }
                if (building === buildings.ChthonianExcavator && !resources.Orichalcum.isUseful()) {
                    maxStateOn = Math.min(maxStateOn, resources.Orichalcum.getBusyWorkers("galaxy_excavator", currentStateOn));
                }
            }


            for (let j = 0; j < building.consumption.length; j++) {
                let resourceType = building.consumption[j];

                // If resource rate is negative then we are gaining resources. So, only check if we are consuming resources
                if (resourceType.rate > 0) {

                    if (resourceType.resource === resources.Food) {
                        // Wendigo doesn't store food. Let's assume it's always available.
                        if (resourceType.resource.storageRatio > 0.05 || isHungryRace()) {
                            continue;
                        }
                    } else if (!(resourceType.resource instanceof Support) && resourceType.resource.storageRatio > 0.01) {
                        // If we have more than xx% of our storage then its ok to lose some resources.
                        // This check is mainly so that power producing buildings don't turn off when rate of change goes negative.
                        // That can cause massive loss of life if turning off space habitats :-)
                        continue;
                    }

                    maxStateOn = Math.min(maxStateOn, resourceType.resource.calculateRateOfChange({buy: true}) / resourceType.rate);
                }
            }

            // If this is a power producing structure then only turn off one at a time!
            if (building.powered < 0) {
                maxStateOn = Math.max(maxStateOn, currentStateOn - 1);
            }

            maxStateOn = Math.max(0, Math.floor(maxStateOn));

            // Now when we know how many buildings we need - let's take resources
            for (let k = 0; k < building.consumption.length; k++) {
                let resourceType = building.consumption[k];

                // Fuel adjust
                let consumptionRate = resourceType.rate;
                if (building._tab === "space" && (resourceType.resource === resources.Oil || resourceType.resource === resources.Helium_3)) {
                    consumptionRate = game.fuel_adjust(consumptionRate, true);
                }
                if ((building._tab === "interstellar" || building._tab === "galaxy") && (resourceType.resource === resources.Deuterium || resourceType.resource === resources.Helium_3) && building !== buildings.AlphaFusion) {
                    consumptionRate = game.int_fuel_adjust(consumptionRate);
                }

                if (building === buildings.BeltSpaceStation && resourceType.resource === resources.Belt_Support) {
                    resources.Belt_Support.rateOfChange += resources.Belt_Support.maxQuantity;
                } else {
                    resourceType.resource.rateOfChange -= consumptionRate * maxStateOn;
                }
            }

            building.tryAdjustState(maxStateOn - currentStateOn);

            if (building === buildings.NeutronCitadel) {
                availablePower -= getCitadelConsumption(maxStateOn);
            } else if (building === buildings.SiriusAscensionTrigger) {
                availablePower -= evolve.actions.interstellar.int_sirius.ascension_trigger.powered() * maxStateOn;
            } else {
                availablePower -= building.powered * maxStateOn;
            }
        }

        if (manageTransport && resources.Lake_Support.rateOfChange > 0) {
            let lakeSupport = resources.Lake_Support.rateOfChange;
            let rating = game.global.blood['spire'] && game.global.blood.spire >= 2 ? 0.8 : 0.85;
            let bireme = buildings.LakeBireme;
            let transport = buildings.LakeTransport;
            let biremeCount = bireme.count;
            let transportCount = transport.count;
            while (biremeCount + transportCount > lakeSupport) {
                let nextBireme = (1 - (rating ** (biremeCount - 1))) * (transportCount * 5);
                let nextTransport = (1 - (rating ** biremeCount)) * ((transportCount - 1) * 5);
                if (nextBireme > nextTransport) {
                    biremeCount--;
                } else {
                    transportCount--;
                }
            }
            bireme.tryAdjustState(biremeCount - bireme.stateOnCount);
            transport.tryAdjustState(transportCount - transport.stateOnCount);
        }

        if (manageSpire && resources.Spire_Support.rateOfChange > 0) {
            // Try to prevent building bays when they won't have enough time to work out used supplies. It assumes that time to build new bay ~= time to clear floor.
            // Make sure we have some transports, so we won't stuck with 0 supply income after disabling collectors, and also let mech manager finish rebuilding after switching floor
            // And also let autoMech do minimum preparation, so we won't stuck with near zero potential
            let buildAllowed = buildings.SpireMechBay.isSmartManaged()
              && (settings.prestigeType !== "demonic" || (settings.prestigeDemonicFloor - buildings.SpireTower.count) > buildings.SpireMechBay.count)
              && (!settings.autoMech || !MechManager.isActive)
              && game.global.portal.transport.cargo.used > 0
              && game.global.portal.transport.cargo.max > 0;

            const spireBuildable = (building) => buildAllowed && building.isAutoBuildable() && resources.Money.maxQuantity >= resourceCost(building, resources.Money);
            let mechBuildable = spireBuildable(buildings.SpireMechBay);
            let puriBuildable = spireBuildable(buildings.SpirePurifier) && buildings.SpirePurifier.stateOffCount === 0;
            let portBuildable = spireBuildable(buildings.SpirePort);
            let campBuildable = spireBuildable(buildings.SpireBaseCamp);

            let nextMechCost = mechBuildable ? resourceCost(buildings.SpireMechBay, resources.Supply) : Number.MAX_SAFE_INTEGER;
            let nextPuriCost = puriBuildable && mechBuildable && (portBuildable || campBuildable) ? resourceCost(buildings.SpirePurifier, resources.Supply) : Number.MAX_SAFE_INTEGER;
            let spireSupport = Math.floor(resources.Spire_Support.rateOfChange);
            let maxBay = Math.min(buildings.SpireMechBay.count, spireSupport);
            let maxPorts = portBuildable ? buildings.SpirePort.autoMax : buildings.SpirePort.count;
            let maxCamps = campBuildable ? buildings.SpireBaseCamp.autoMax : buildings.SpireBaseCamp.count;

            let [bestSupplies, bestPort, bestBase] = getBestSupplyRatio(spireSupport, maxPorts, maxCamps);
            buildings.SpirePurifier.extraDescription = `Supported Supplies: ${Math.floor(bestSupplies)}<br>${buildings.SpirePurifier.extraDescription}`;

            let canBuild = bestSupplies >= nextPuriCost || bestSupplies >= nextMechCost;
            for (let targetMech = maxBay; targetMech >= 0; targetMech--) {
                let [targetSupplies, targetPort, targetCamp] = getBestSupplyRatio(spireSupport - targetMech, maxPorts, maxCamps);

                let storageUpgrade =
                    targetPort > buildings.SpirePort.count ? buildings.SpirePort :
                    targetCamp > buildings.SpireBaseCamp.count ? buildings.SpireBaseCamp :
                    null;
                if (storageUpgrade) {
                    let storageCost = resourceCost(storageUpgrade, resources.Supply);
                    for (let i = maxBay; i >= 0; i--) {
                        let [storageSupplies, storagePort, storageCamp] = getBestSupplyRatio(spireSupport - i, maxPorts, maxCamps);
                        if (storageSupplies >= storageCost) {
                            adjustSpire(i, storagePort, storageCamp);
                            break;
                        }
                    }
                    break;
                }
                if (!canBuild || targetSupplies >= nextPuriCost || targetSupplies >= nextMechCost) {
                    adjustSpire(targetMech, targetPort, targetCamp);
                    break;
                }
            }
        }

        resources.Power.currentQuantity = availablePower;
        resources.Power.rateOfChange = availablePower;

        // Disable underpowered buildings, one at time. Unless it's ship - which may stay with warning until they'll get crew
        let warnBuildings = $("span.on.warn");
        for (let i = 0; i < warnBuildings.length; i++) {
            let building = buildingIds[warnBuildings[i].parentNode.id];
            if (building && building.autoStateEnabled && !building.is.ship) {
                if (((building === buildings.BeltEleriumShip || building === buildings.BeltIridiumShip || building === buildings.BeltIronShip) &&
                     (buildings.BeltEleriumShip.stateOnCount * 2 + buildings.BeltIridiumShip.stateOnCount + buildings.BeltIronShip.stateOnCount) <= resources.Belt_Support.maxQuantity) ||
                    ((building === buildings.LakeBireme || building === buildings.LakeTransport) &&
                     (buildings.LakeBireme.stateOnCount + buildings.LakeTransport.stateOnCount) <= resources.Lake_Support.maxQuantity)) {
                      continue;
                }
                building.tryAdjustState(-1);
                break;
            }
        }
    }

    function adjustSpire(mech, port, camp) {
        buildings.SpireMechBay.tryAdjustState(mech - buildings.SpireMechBay.stateOnCount);
        buildings.SpirePort.tryAdjustState(port - buildings.SpirePort.stateOnCount);
        buildings.SpireBaseCamp.tryAdjustState(camp - buildings.SpireBaseCamp.stateOnCount);
    }

    function getBestSupplyRatio(support, maxPorts, maxCamps) {
        let bestSupplies = 0;
        let bestPort = support;
        let bestBaseCamp = 0;
        for (let i = 0; i < support; i++) {
            let maxSupplies = Math.min(support - i, maxPorts) * (1 + Math.min(i, maxCamps) * 0.4);
            if (maxSupplies <= bestSupplies) {
                break;
            }
            bestSupplies = maxSupplies;
            bestPort = Math.min(support - i, maxPorts);
            bestBaseCamp = Math.min(i, maxCamps);
        }
        return [bestSupplies * 10000 + 100, bestPort, bestBaseCamp];
    }

    function autoStorage() {
        if (haveTask("bal_storage") || !StorageManager.initStorage()) {
            return;
        }

        let storageList = StorageManager.priorityList.filter(r => r.isUnlocked() && r.isManagedStorage());
        if (storageList.length === 0) {
            return;
        }

        let crateVolume = poly.crateValue();
        let containerVolume = poly.containerValue();
        if (crateVolume <= 0 || containerVolume <= 0) {
            return;
        }
        let totalCrates = resources.Crates.currentQuantity;
        let totalContainers = resources.Containers.currentQuantity;
        let storageAdjustments = [];

        // Init storageAdjustments, we need to do it saparately, as loop below can jump to the and of array
        for (let i = 0; i < storageList.length; i++){
            storageAdjustments.push({resource: storageList[i], adjustCrates: 0, adjustContainers: 0});
        }

        let totalStorageMissing = 0;

        // Calculate storages
        for (let i = 0; i < storageList.length; i++){
            let resource = storageList[i];
            let adjustment = storageAdjustments[i];
            let calculatedCrates = resource.currentCrates + adjustment.adjustCrates;
            let calculatedContainers = resource.currentContainers + adjustment.adjustContainers;
            let cratesStorage = calculatedCrates * crateVolume;
            let containersStorage = calculatedContainers * containerVolume;
            let extraStorage = cratesStorage + containersStorage;
            let rawStorage = resource.maxQuantity - extraStorage;
            let freeStorage = resource.maxQuantity - resource.currentQuantity;
            let extraStorageRequired = resource.storageRequired - rawStorage;

            // If we're overflowing, and want to store more - just request one more crate volume
            if (resource.storeOverflow) {
                extraStorageRequired = Math.max(1, extraStorageRequired, resource.currentQuantity * 1.02 - rawStorage);
            }

            // We don't need any extra storage here, and don't care about wasting, just remove everything and go to next resource
            if (!settings.storageSafeReassign && extraStorageRequired <= 0){
                totalCrates += calculatedCrates;
                totalContainers += calculatedContainers;
                adjustment.adjustCrates = resource.currentCrates * -1;
                adjustment.adjustContainers = resource.currentContainers * -1;
                continue;
            }

            // Check if have extra containers here
            if (containersStorage > 0 && ((extraStorage - containerVolume) > extraStorageRequired || calculatedContainers > resource.autoContainersMax)){
                let uselessContainers = Math.floor((extraStorage - extraStorageRequired) / containerVolume);
                let extraContainers = Math.min(calculatedContainers, uselessContainers);
                let overcapContainers = calculatedContainers - resource.autoContainersMax;
                let removedContainers = Math.max(overcapContainers, extraContainers);

                if (settings.storageSafeReassign || resource.storeOverflow) {
                    let emptyContainers = Math.floor(freeStorage / containerVolume);
                    removedContainers = Math.min(removedContainers, emptyContainers);
                }

                totalContainers += removedContainers;
                adjustment.adjustContainers -= removedContainers;
                calculatedContainers -= removedContainers;
                extraStorage -= removedContainers * containerVolume;
                freeStorage -= removedContainers * containerVolume;
            }

            // Check if have extra crates here
            if (cratesStorage > 0 && ((extraStorage - crateVolume) > extraStorageRequired || calculatedCrates > resource.autoCratesMax)){
                let uselessCrates = Math.floor((extraStorage - extraStorageRequired) / crateVolume);
                let extraCrates = Math.min(calculatedCrates, uselessCrates);
                let overcapCrates = calculatedCrates - resource.autoCratesMax;
                let removedCrates = Math.max(overcapCrates, extraCrates);

                if (settings.storageSafeReassign || resource.storeOverflow) {
                    let emptyCrates = Math.floor(freeStorage / crateVolume);
                    removedCrates = Math.min(removedCrates, emptyCrates);
                }

                totalCrates += removedCrates;
                adjustment.adjustCrates -= removedCrates;
                extraStorage -= removedCrates * crateVolume;
                //freeStorage -= removedCrates * crateVolume;
            }

            let missingStorage = extraStorageRequired - extraStorage;

            // Check if we're missing storage on this resource
            if (missingStorage > 0){
                let maxCratesToUnassign = resource.autoCratesMax - calculatedCrates;
                let maxContainersToUnassign = resource.autoContainersMax - calculatedContainers;
                let availableStorage = Math.min(maxCratesToUnassign, totalCrates) * crateVolume + Math.min(maxContainersToUnassign, totalContainers) * containerVolume;

                // We don't have enough containers, let's try to unassign something less prioritized
                if (availableStorage < missingStorage){
                    for (let j = storageList.length-1; j > i; j--){
                        let otherFreeStorage = storageList[j].maxQuantity - storageList[j].currentQuantity + (storageAdjustments[j].adjustCrates * crateVolume) + (storageAdjustments[j].adjustContainers * containerVolume);
                        let otherCalculatedCrates = storageList[j].currentCrates + storageAdjustments[j].adjustCrates;
                        let otherCalculatedContainers = storageList[j].currentContainers + storageAdjustments[j].adjustContainers;

                        // Unassign crates
                        if (maxCratesToUnassign > 0 && otherCalculatedCrates > 0) {
                            let missingCrates = Math.ceil(missingStorage / crateVolume);
                            let cratesToUnassign = Math.min(otherCalculatedCrates, missingCrates, maxCratesToUnassign);

                            if (settings.storageSafeReassign || storageList[j].storeOverflow) {
                                let emptyCrates = Math.floor(otherFreeStorage / crateVolume);
                                cratesToUnassign = Math.min(cratesToUnassign, emptyCrates);
                            }

                            storageAdjustments[j].adjustCrates -= cratesToUnassign;
                            totalCrates += cratesToUnassign;
                            maxCratesToUnassign -= cratesToUnassign;
                            missingStorage -= cratesToUnassign * crateVolume;
                            otherFreeStorage -= cratesToUnassign * crateVolume;
                        }

                        // Unassign containers, if we still need them
                        if (maxContainersToUnassign > 0 && otherCalculatedContainers > 0 && missingStorage > 0){
                            let missingContainers = Math.ceil(missingStorage / containerVolume);
                            let containersToUnassign = Math.min(otherCalculatedContainers, missingContainers, maxContainersToUnassign);

                            if (settings.storageSafeReassign || storageList[j].storeOverflow) {
                                let emptyContainers = Math.floor(otherFreeStorage / containerVolume);
                                containersToUnassign = Math.min(containersToUnassign, emptyContainers);
                            }

                            storageAdjustments[j].adjustContainers -= containersToUnassign;
                            totalContainers += containersToUnassign;
                            maxContainersToUnassign -= containersToUnassign;
                            missingStorage -= containersToUnassign * containerVolume;
                            //otherFreeStorage -= containersToUnassign * containerVolume;
                        }

                        // If we got all we needed - get back to assigning
                        if (missingStorage <= 0){
                            break;
                        }
                    }
                }
                // Restore missing storage, in case if was changed during unassignment
                missingStorage = extraStorageRequired - extraStorage;

                // Add crates
                if (totalCrates > 0) {
                    let missingCrates = Math.ceil(missingStorage / crateVolume);
                    let allowedCrates = resource.autoCratesMax - calculatedCrates;
                    let addCrates = Math.min(totalCrates, allowedCrates, missingCrates);
                    totalCrates -= addCrates;
                    adjustment.adjustCrates += addCrates;
                    missingStorage -= addCrates * crateVolume;
                }

                // Add containers
                if (totalContainers > 0 && missingStorage > 0){
                    let missingContainers = Math.ceil(missingStorage / containerVolume);
                    let allowedContainers = resource.autoContainersMax - calculatedContainers;
                    let addContainers = Math.min(totalContainers, allowedContainers, missingContainers);
                    totalContainers -= addContainers;
                    adjustment.adjustContainers += addContainers;
                    missingStorage -= addContainers * containerVolume;
                }

                if (missingStorage > 0){
                    totalStorageMissing += missingStorage;
                }
            }
        }

        // Build more storage if we didn't had enough
        if (totalStorageMissing > 0){
            let numberOfCratesWeCanBuild = resources.Crates.maxQuantity - resources.Crates.currentQuantity;
            let numberOfContainersWeCanBuild = resources.Containers.maxQuantity - resources.Containers.currentQuantity;

            resources.Crates.resourceRequirements.forEach(requirement =>
                numberOfCratesWeCanBuild = Math.min(numberOfCratesWeCanBuild, requirement.resource.currentQuantity / requirement.quantity)
            );

            resources.Containers.resourceRequirements.forEach(requirement =>
                numberOfContainersWeCanBuild = Math.min(numberOfContainersWeCanBuild, requirement.resource.currentQuantity / requirement.quantity)
            );

            if (settings.storageLimitPreMad && !game.global.race['cataclysm'] && !haveTech("mad")) {
              // Only build pre-mad containers when steel storage is over 80%
              if (resources.Steel.storageRatio < 0.8) {
                  numberOfContainersWeCanBuild = 0;
              }
              // Only build pre-mad crates when already have Plywood for next level of library
              if (isLumberRace() && buildings.Library.count < 20 && buildings.Library.resourceRequirements.some(requirement => requirement.resource === resources.Plywood && requirement.quantity > resources.Plywood.currentQuantity) && (resources.Crates.maxQuantity !== buildings.StorageYard.count * 10)) {
                  numberOfCratesWeCanBuild = 0;
              }
            }

            // Build crates
            if (resources.Crates.currentQuantity === 0) {
                let cratesToBuild = Math.min(Math.floor(numberOfCratesWeCanBuild), Math.ceil(totalStorageMissing / crateVolume));
                StorageManager.constructCrate(cratesToBuild);

                resources.Crates.currentQuantity += cratesToBuild;
                resources.Crates.resourceRequirements.forEach(requirement =>
                    requirement.resource.currentQuantity -= requirement.quantity * cratesToBuild
                );
                totalStorageMissing -= cratesToBuild * crateVolume;
            }

            // And containers, if still needed
            if (totalStorageMissing > 0) {
                let containersToBuild = Math.min(Math.floor(numberOfContainersWeCanBuild), Math.ceil(totalStorageMissing / crateVolume));
                StorageManager.constructContainer(containersToBuild);

                resources.Containers.currentQuantity += containersToBuild;
                resources.Containers.resourceRequirements.forEach(requirement =>
                    requirement.resource.currentQuantity -= requirement.quantity * containersToBuild
                );
            }
        }

        // Go to clicking, unassign first
        storageAdjustments.forEach(adjustment => {
            if (adjustment.adjustCrates < 0) {
                StorageManager.unassignCrate(adjustment.resource, adjustment.adjustCrates * -1);
                adjustment.resource.maxQuantity -= adjustment.adjustCrates * -1 * crateVolume;
                resources.Crates.currentQuantity += adjustment.adjustCrates * -1;
            }
            if (adjustment.adjustContainers < 0) {
                StorageManager.unassignContainer(adjustment.resource, adjustment.adjustContainers * -1);
                adjustment.resource.maxQuantity -= adjustment.adjustContainers * -1 * containerVolume;
                resources.Containers.currentQuantity += adjustment.adjustContainers * -1;
            }
        });

        // And now assign
        storageAdjustments.forEach(adjustment => {
            if (adjustment.adjustCrates > 0) {
                StorageManager.assignCrate(adjustment.resource, adjustment.adjustCrates);
                adjustment.resource.maxQuantity += adjustment.adjustCrates * crateVolume;
                resources.Crates.currentQuantity -= adjustment.adjustCrates;
            }
            if (adjustment.adjustContainers > 0) {
                StorageManager.assignContainer(adjustment.resource, adjustment.adjustContainers);
                adjustment.resource.maxQuantity += adjustment.adjustContainers * containerVolume;
                resources.Containers.currentQuantity -= adjustment.adjustContainers;
            }
        });
    }

    // TODO: Mutate out of nasty traits
    function autoMinorTrait() {
        let m = MinorTraitManager;
        if (!m.isUnlocked()) {
            return;
        }

        let traitList = m.managedPriorityList();
        if (traitList.length === 0) {
            return;
        }

        let totalWeighting = 0;
        let totalGeneCost = 0;

        traitList.forEach(trait => {
            totalWeighting += trait.weighting;
            totalGeneCost += trait.geneCost();
        });

        traitList.forEach(trait => {
            let traitCost = trait.geneCost();
            if (trait.weighting / totalWeighting >= traitCost / totalGeneCost && resources.Genes.currentQuantity >= traitCost) {
                m.buyTrait(trait.traitName);
                resources.Genes.currentQuantity -= traitCost;
            }
        });
    }

    function adjustTradeRoutes() {
        let tradableResources = MarketManager.priorityList
          .filter(r => r.isMarketUnlocked() && (r.autoTradeBuyEnabled || r.autoTradeSellEnabled))
          .sort((a, b) => (b.storageRatio > 0.99 ? b.tradeSellPrice * 1000 : b.usefulRatio) - (a.storageRatio > 0.99 ? a.tradeSellPrice * 1000 : a.usefulRatio));
        let requiredTradeRoutes = {};
        let currentMoneyPerSecond = resources.Money.rateOfChange;
        let tradeRoutesUsed = 0;
        let importRouteCap = MarketManager.getImportRouteCap();
        let exportRouteCap = MarketManager.getExportRouteCap();
        let [maxTradeRoutes, unmanagedTradeRoutes] = MarketManager.getMaxTradeRoutes();

        // Fill trade routes with selling
        for (let i = 0; i < tradableResources.length; i++) {
            let resource = tradableResources[i];
            if (!resource.autoTradeSellEnabled) {
                continue;
            }
            requiredTradeRoutes[resource.id] = 0;

            if (tradeRoutesUsed >= maxTradeRoutes
                || (game.global.race['banana'] && tradeRoutesUsed > 0)
                || (settings.tradeRouteSellExcess
                  ? resource.usefulRatio < 1
                  : resource.storageRatio < 0.99)) {
                continue;
            }

            let routesToAssign = Math.min(exportRouteCap, maxTradeRoutes - tradeRoutesUsed, Math.floor(resource.rateOfChange / resource.tradeRouteQuantity));
            if (routesToAssign > 0) {
                tradeRoutesUsed += routesToAssign;
                requiredTradeRoutes[resource.id] -= routesToAssign;
                currentMoneyPerSecond += resource.tradeSellPrice * routesToAssign;
            }
        }
        let minimumAllowedMoneyPerSecond = Math.min(resources.Money.maxQuantity - resources.Money.currentQuantity, Math.max(settings.tradeRouteMinimumMoneyPerSecond, settings.tradeRouteMinimumMoneyPercentage / 100 * currentMoneyPerSecond));

        // Init adjustment, and sort groups by priorities
        let priorityGroups = {};
        for (let i = 0; i < tradableResources.length; i++) {
            let resource = tradableResources[i];
            if (!resource.autoTradeBuyEnabled) {
                continue;
            }
            requiredTradeRoutes[resource.id] = requiredTradeRoutes[resource.id] ?? 0;

            if (resource.autoTradeWeighting <= 0
                || (settings.tradeRouteSellExcess
                  ? resource.usefulRatio > 0.99
                  : resource.storageRatio > 0.98)) {
                continue;
            }

            let priority = resource.autoTradePriority;
            if (resource.isDemanded()) {
                priority = Math.max(priority, 100);
                if (!resources.Money.isDemanded()) {
                    // Resource demanded, money not demanded - ignore min money, and spend as much as possible
                    minimumAllowedMoneyPerSecond = 0;
                }
            } else if ((priority < 100 && priority !== -1) && resources.Money.isDemanded()) {
                // Don't buy resources with low priority when money is demanded
                continue;
            }

            if (priority !== 0) {
                priorityGroups[priority] = priorityGroups[priority] ?? [];
                priorityGroups[priority].push(resource);
            }
        }
        let priorityList = Object.keys(priorityGroups).sort((a, b) => b - a).map(key => priorityGroups[key]);
        if (priorityGroups["-1"] && priorityList.length > 1) {
            priorityList.splice(priorityList.indexOf(priorityGroups["-1"], 1));
            priorityList[0].push(...priorityGroups["-1"]);
        }

        // Calculate amount of routes per resource
        let resSorter = (a, b) => ((requiredTradeRoutes[a.id] / a.autoTradeWeighting) - (requiredTradeRoutes[b.id] / b.autoTradeWeighting)) || b.autoTradeWeighting - a.autoTradeWeighting;
        let remainingRoutes, unassignStep;
        if (getGovernor() === "entrepreneur") {
            remainingRoutes = tradeRoutesUsed - unmanagedTradeRoutes;
            unassignStep = 2;
        } else {
            remainingRoutes = maxTradeRoutes;
            unassignStep = 1;
        }
        outerLoop:
        for (let i = 0; i < priorityList.length && remainingRoutes > 0; i++) {
            let trades = priorityList[i];
            assignLoop:
            while(trades.length > 0 && remainingRoutes > 0) {
                let resource = trades.sort(resSorter)[0];
                // TODO: Fast assign for single resource

                if (requiredTradeRoutes[resource.id] >= importRouteCap) {
                    trades.shift();
                    continue;
                }
                // Stop if next route will lower income below allowed minimum
                if (currentMoneyPerSecond - resource.tradeBuyPrice < minimumAllowedMoneyPerSecond) {
                    break outerLoop;
                }

                if (tradeRoutesUsed < maxTradeRoutes) {
                    // Still have unassigned routes
                    currentMoneyPerSecond -= resource.tradeBuyPrice;
                    tradeRoutesUsed++;
                    remainingRoutes--;
                    requiredTradeRoutes[resource.id]++;
                } else {
                    // No free routes, remove selling
                    for (let otherId in requiredTradeRoutes) {
                        if (requiredTradeRoutes[otherId] === undefined) {
                            continue
                        }
                        let otherResource = resources[otherId];
                        let currentRequired = requiredTradeRoutes[otherId];
                        if (currentRequired >= 0 || resource === otherResource) {
                            continue;
                        }

                        if (currentMoneyPerSecond - otherResource.tradeSellPrice - resource.tradeBuyPrice > minimumAllowedMoneyPerSecond && remainingRoutes >= unassignStep) {
                            currentMoneyPerSecond -= otherResource.tradeSellPrice;
                            currentMoneyPerSecond -= resource.tradeBuyPrice;
                            requiredTradeRoutes[otherId]++;
                            requiredTradeRoutes[resource.id]++;
                            remainingRoutes -= unassignStep;
                            continue assignLoop;
                        }
                    }
                    // Couldn't remove route, stop asigning
                    break outerLoop;
                }
            }
        }

        // Adjust our trade routes - always adjust towards zero first to free up trade routes
        let adjustmentTradeRoutes = [];
        for (let i = 0; i < tradableResources.length; i++) {
            let resource = tradableResources[i];
            if (requiredTradeRoutes[resource.id] === undefined) {
                continue;
            }
            adjustmentTradeRoutes[i] = requiredTradeRoutes[resource.id] - resource.tradeRoutes;

            if (requiredTradeRoutes[resource.id] === 0 && resource.tradeRoutes !== 0) {
                MarketManager.zeroTradeRoutes(resource);
                adjustmentTradeRoutes[i] = 0;
            } else if (adjustmentTradeRoutes[i] > 0 && resource.tradeRoutes < 0) {
                MarketManager.addTradeRoutes(resource, adjustmentTradeRoutes[i]);
                adjustmentTradeRoutes[i] = 0;
            } else if (adjustmentTradeRoutes[i] < 0 && resource.tradeRoutes > 0) {
                MarketManager.removeTradeRoutes(resource, -1 * adjustmentTradeRoutes[i]);
                adjustmentTradeRoutes[i] = 0;
            }
        }

        // Adjust our trade routes - we've adjusted towards zero, now adjust the rest
        for (let i = 0; i < tradableResources.length; i++) {
            let resource = tradableResources[i];
            if (requiredTradeRoutes[resource.id] === undefined) {
                continue;
            }

            if (adjustmentTradeRoutes[i] > 0) {
                MarketManager.addTradeRoutes(resource, adjustmentTradeRoutes[i]);
            } else if (adjustmentTradeRoutes[i] < 0) {
                MarketManager.removeTradeRoutes(resource, -1 * adjustmentTradeRoutes[i]);
            }
        }
        // It does change rates of changes of resources, but we don't want to store this changes.
        // Sold resources can be easily reclaimed, and we want to be able to use it for production, ejecting, upkeep, etc, so let's pretend they're still here
        // And bought resources are dungerous to use - we don't want to end with negative income after recalculating trades
        resources.Money.rateOfChange = currentMoneyPerSecond;
    }

    var FleetManager = {
        _fleetVueBinding: "fleet",
        _fleetVue: undefined,

        initFleet() {
            if (!game.global.tech.piracy) {
                return false;
            }

            this._fleetVue = getVueById(this._fleetVueBinding);
            if (this._fleetVue === undefined) {
                return false;
            }

            return true;
        },

        addShip(region, ship, count) {
            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._fleetVue.add(region, ship);
            }
        },

        subShip(region, ship, count) {
            resetMultiplier();
            for (let i = 0; i < count; i++) {
                this._fleetVue.sub(region, ship);
            }
        }
    }

    function autoFleet() {
        if (!FleetManager.initFleet()) {
            return;
        }
        let def = game.global.galaxy.defense;

        // Init our current state
        let allRegions = [
            {name: "gxy_stargate", piracy: (game.global.race['instinct'] ? 0.09 : 0.1) * game.global.tech.piracy, armada: buildings.StargateDefensePlatform.stateOnCount * 20, useful: true},
            {name: "gxy_gateway", piracy: (game.global.race['instinct'] ? 0.09 : 0.1) * game.global.tech.piracy, armada: buildings.GatewayStarbase.stateOnCount * 25, useful: buildings.BologniumShip.stateOnCount > 0},
            {name: "gxy_gorddon", piracy: (game.global.race['instinct'] ? 720 : 800), armada: 0, useful: buildings.GorddonFreighter.stateOnCount > 0 || buildings.Alien1SuperFreighter.stateOnCount > 0 || buildings.GorddonSymposium.stateOnCount > 0},
            {name: "gxy_alien1", piracy: (game.global.race['instinct'] ? 900 : 1000), armada: 0, useful: buildings.Alien1VitreloyPlant.stateOnCount > 0},
            {name: "gxy_alien2", piracy: (game.global.race['instinct'] ? 2250 : 2500), armada: buildings.Alien2Foothold.stateOnCount * 50 + buildings.Alien2ArmedMiner.stateOnCount * game.actions.galaxy.gxy_alien2.armed_miner.ship.rating(), useful: buildings.Alien2Scavenger.stateOnCount > 0 || buildings.Alien2ArmedMiner.stateOnCount > 0},
            {name: "gxy_chthonian", piracy: (game.global.race['instinct'] ? 7000 : 7500), armada: buildings.ChthonianMineLayer.stateOnCount * game.actions.galaxy.gxy_chthonian.minelayer.ship.rating() + buildings.ChthonianRaider.stateOnCount * game.actions.galaxy.gxy_chthonian.raider.ship.rating(), useful: buildings.ChthonianExcavator.stateOnCount > 0 || buildings.ChthonianRaider.stateOnCount > 0},
        ];
        let allFleets = [
            {name: "scout_ship", count: 0, power: game.actions.galaxy.gxy_gateway.scout_ship.ship.rating()},
            {name: "corvette_ship", count: 0, power: game.actions.galaxy.gxy_gateway.corvette_ship.ship.rating()},
            {name: "frigate_ship", count: 0, power: game.actions.galaxy.gxy_gateway.frigate_ship.ship.rating()},
            {name: "cruiser_ship", count: 0, power: game.actions.galaxy.gxy_gateway.cruiser_ship.ship.rating()},
            {name: "dreadnought", count: 0, power: game.actions.galaxy.gxy_gateway.dreadnought.ship.rating()},
        ];
        let minPower = allFleets[0].power;

        // We can't rely on stateOnCount - it won't give us correct number of ships of some of them missing crew
        let fleetIndex = Object.fromEntries(allFleets.map((ship, index) => [ship.name, index]));
        Object.values(def).forEach(assigned => Object.entries(assigned).forEach(([ship, count]) => allFleets[fleetIndex[ship]].count += count));

        // Check if we can perform assault mission
        let assault = null;
        if (buildings.ChthonianMission.isUnlocked() && settings.fleetChthonianLoses !== "ignore") {
            let fleetReq, fleetWreck;
            if (settings.fleetChthonianLoses === "low") {
                fleetReq = 4500;
                fleetWreck = 80;
            } else if (settings.fleetChthonianLoses === "avg") {
                fleetReq = 2500;
                fleetWreck = 160;
            } else if (settings.fleetChthonianLoses === "high") {
                fleetReq = 1250;
                fleetWreck = 500;
            } else if (settings.fleetChthonianLoses === "dread") {
                if (allFleets[4].count > 0) {
                    assault = {ships: [0,0,0,0,1], region: "gxy_chthonian", mission: buildings.ChthonianMission};
                }
            } else if (settings.fleetChthonianLoses === "frigate") {
                let totalPower = allFleets.reduce((sum, ship) => sum + (ship.power >= allFleets[2].power ? ship.power * ship.count : 0), 0);
                if (totalPower >= 4500) {
                    assault = {ships: allFleets.map((ship, idx) => idx >= 2 ? ship.count : 0), region: "gxy_chthonian", mission: buildings.ChthonianMission};
                }
            }
            if (game.global.race['instinct']) {
                fleetWreck /= 2;
            }

            let availableShips = allFleets.map(ship => ship.count);
            let powerToReserve = fleetReq - fleetWreck;
            for (let i = availableShips.length - 1; i >= 0 && powerToReserve > 0; i--) {
                let reservedShips = Math.min(availableShips[i], Math.ceil(powerToReserve / allFleets[i].power));
                availableShips[i] -= reservedShips;
                powerToReserve -= reservedShips * allFleets[i].power;
            }
            if (powerToReserve <= 0) {
                let sets = availableShips.map((amount, idx) => [...Array(Math.min(amount, Math.floor((fleetWreck + (minPower - 0.1)) / allFleets[idx].power)) + 1).keys()]);
                for (let set of cartesian(...sets)) {
                    let powerMissing = fleetWreck - set.reduce((sum, amt, idx) => sum + amt * allFleets[idx].power, 0);
                    if (powerMissing <= 0 && powerMissing > minPower * -1) {
                        let lastShip = set.reduce((prev, val, cur) => val > 0 ? cur : prev, 0);
                        let team = allFleets.map((ship, idx) => idx >= lastShip ? ship.count : set[idx]);
                        assault = {ships: team, region: "gxy_chthonian", mission: buildings.ChthonianMission};
                        break;
                    }
                }
            }
        } else if (buildings.Alien2Mission.isUnlocked() && resources.Knowledge.maxQuantity >= settings.fleetAlien2Knowledge) {
            let totalPower = allFleets.reduce((sum, ship) => sum + (ship.power * ship.count), 0);
            if (totalPower >= 650) {
                assault = {ships: allFleets.map(ship => ship.count), region: "gxy_alien2", mission: buildings.Alien2Mission};
            }
        }
        if (assault) {
            // Unassign all ships from where there're assigned currently
            Object.entries(def).forEach(([region, assigned]) => Object.entries(assigned).forEach(([ship, count]) => FleetManager.subShip(region, ship, count)));
            // Assign to target region
            allFleets.forEach((ship, idx) => FleetManager.addShip(assault.region, ship.name, assault.ships[idx]));
            assault.mission.click();
            return; // We're done for now; lot of data was invalidated during attack, we'll manage remaining ships in next tick
        }

        let regionsToProtect = allRegions.filter(region => region.useful && region.piracy - region.armada > 0);
        let allFleet = allFleets.filter(ship => ship.count > 0);

        for (let i = 0; i < allRegions.length; i++) {
            let region = allRegions[i];
            region.priority = settings["fleet_pr_" + region.name];
            region.assigned = {};
            for (let j = 0; j < allFleets.length; j++) {
                region.assigned[allFleets[j].name] = 0;
            }
        }

        // Calculate min allowed coverage, if we have more ships than we can allocate without overflowing.
        let missingDef = regionsToProtect.map(region => region.piracy - region.armada);
        for (let i = allFleets.length - 1; i >= 0; i--) {
            let ship = allFleets[i];
            let maxAllocate = missingDef.reduce((sum, def) => sum + Math.floor(def / ship.power), 0);
            if (ship.count > maxAllocate) {
                if (ship.count >= maxAllocate + missingDef.length) {
                    ship.cover = 0;
                } else {
                    let overflows = missingDef.map(def => def % ship.power).sort((a, b) => b - a);
                    ship.cover = overflows[ship.count - maxAllocate - 1];
                }
            } else {
                ship.cover = ship.power - (minPower - 0.1);
            }
            if (ship.count >= maxAllocate) {
                missingDef.forEach((def, idx, arr) => arr[idx] = def % ship.power);
                if (ship.count > maxAllocate) {
                    missingDef.sort((a, b) => b - a);
                    for (let j = 0; j < ship.count - maxAllocate; j++) {
                        missingDef[j] = 0;
                    }
                }
            }
        }
        for (let i = 0; i < allFleets.length; i++){
            if (allFleets[i].count > 0) {
                allFleets[i].cover = 0.1;
                break;
            }
        }

        // Calculate actual amount of ships per zone
        let priorityList = regionsToProtect.sort((a, b) => a.priority - b.priority);
        for (let i = 0; i < priorityList.length; i++) {
            let region = priorityList[i];
            let missingDef = region.piracy - region.armada;

            // First pass, try to assign ships without overuse (unless we have enough ships to overuse everything)
            for (let k = allFleets.length - 1; k >= 0 && missingDef > 0; k--) {
                let ship = allFleets[k];
                if (ship.cover <= missingDef) {
                    let shipsToAssign = Math.min(ship.count, Math.floor(missingDef / ship.power));
                    if (shipsToAssign < ship.count && shipsToAssign * ship.power + ship.cover <= missingDef) {
                        shipsToAssign++;
                    }
                    region.assigned[ship.name] += shipsToAssign;
                    ship.count -= shipsToAssign;
                    missingDef -= shipsToAssign * ship.power;
                }
            }

            if (settings.fleetMaxCover && missingDef > 0) {
                // Second pass, try to fill remaining gaps, if wasteful overuse is allowed
                let index = -1;
                while (missingDef > 0 && ++index < allFleets.length) {
                    let ship = allFleets[index];
                    if (ship.count > 0) {
                        let shipsToAssign = Math.min(ship.count, Math.ceil(missingDef / ship.power));
                        region.assigned[ship.name] += shipsToAssign;
                        ship.count -= shipsToAssign;
                        missingDef -= shipsToAssign * ship.power;
                    }
                }

                // If we're still missing defense it means we have no more ships to assign
                if (missingDef > 0) {
                    break;
                }

                // Third pass, retrive ships which not needed after second pass
                while (--index >= 0) {
                    let ship = allFleets[index];
                    if (region.assigned[ship.name] > 0 && missingDef + ship.power <= 0) {
                        let uselesShips = Math.min(region.assigned[ship.name], Math.floor(missingDef / ship.power * -1));
                        if (uselesShips > 0) {
                            region.assigned[ship.name] -= uselesShips;
                            ship.count += uselesShips;
                            missingDef += uselesShips * ship.power;
                        }
                    }
                }
            }
        }

        // Assign remaining ships to gorddon, to utilize Symposium
        if (buildings.GorddonSymposium.stateOnCount > 0) {
            allFleets.forEach(ship => allRegions[2].assigned[ship.name] += ship.count);
        }

        let shipDeltas = allRegions.map(region => Object.entries(region.assigned).map(([ship, count]) => [ship, count - def[region.name][ship]]));

        shipDeltas.forEach((ships, region) => ships.forEach(([ship, delta]) => delta < 0 && FleetManager.subShip(allRegions[region].name, ship, delta * -1)));
        shipDeltas.forEach((ships, region) => ships.forEach(([ship, delta]) => delta > 0 && FleetManager.addShip(allRegions[region].name, ship, delta)));
    }

    function autoMech() {
        let m = MechManager;
        if (!m.initLab()) {
            return;
        }
        let mechBay = game.global.portal.mechbay;
        let prolongActive = m.isActive;
        m.isActive = false;

        // Rearrange mechs for best efficiency if some of the bays are disabled
        if (m.inactiveMechs.length > 0) {
            // Each drag redraw mechs list, do it just once per tick to reduce stress
            if (m.activeMechs.length > 0) {
                m.activeMechs.sort((a, b) => a.efficiency - b.efficiency);
                m.inactiveMechs.sort((a, b) => b.efficiency - a.efficiency);
                if (m.activeMechs[0].efficiency < m.inactiveMechs[0].efficiency) {
                    if (m.activeMechs.length > m.inactiveMechs.length) {
                        m.dragMech(m.activeMechs[0].id, mechBay.mechs.length - 1);
                    } else {
                        m.dragMech(m.inactiveMechs[0].id, 0);
                    }
                }
            }
            return; // Can't do much while having disabled mechs, without scrapping them all. And that's really bad idea. Just wait until bays will be enabled back.
        }

        if (haveTask("mech")) {
            return; // Do nothing except dragging if governor enabled
        }

        let newMech = {};
        if (settings.mechBuild === "random") {
            newMech = m.getRandomMech(m.getPreferredSize());
        } else if (settings.mechBuild === "user") {
            newMech = {...mechBay.blueprint, ...m.getMechStats(mechBay.blueprint)};
        } else { // mechBuild === "none"
            return; // Mech build disabled, stop here
        }
        let [newGems, newSupply, newSpace] = m.getMechCost(newMech);

        if (!settings.mechFillBay && resources.Supply.spareMaxQuantity < newSupply) {
            return; // Not enough supply capacity, and smaller mechs are disabled, can't do anything
        }

        let baySpace = mechBay.max - mechBay.bay;
        let lastFloor = settings.prestigeType === "demonic" && buildings.SpireTower.count >= settings.prestigeDemonicFloor && haveTech("waygate", 3);

        // Save up supply for next floor when, unless our supply income only from collectors, thet aren't built yet
        if (settings.mechSaveSupply && !lastFloor && !m.isActive && ((game.global.portal.transport.cargo.used > 0 && game.global.portal.transport.cargo.max > 0) || resources.Supply.rateOfChange >= settings.mechMinSupply)) {
            let missingSupplies = resources.Supply.maxQuantity - resources.Supply.currentQuantity;
            if (baySpace < newSpace) {
                missingSupplies -= m.getMechRefund({size: "titan"})[1];
            }
            let timeToFullSupplies = missingSupplies / resources.Supply.rateOfChange;
            if (m.getTimeToClear() <= timeToFullSupplies) {
                return; // Floor will be cleared before capping supplies, save them
            }
        }

        let canExpandBay = settings.mechBaysFirst && buildings.SpireMechBay.isAutoBuildable() && (buildings.SpireMechBay.isAffordable(true) || (buildings.SpirePurifier.isAutoBuildable() && buildings.SpirePurifier.isAffordable(true) && buildings.SpirePurifier.stateOffCount === 0));
        let mechScrap = settings.mechScrap;
        if (canExpandBay && resources.Supply.currentQuantity < resources.Supply.maxQuantity && !m.isActive) {
            // We can build purifier or bay once we'll have enough resources, do not rebuild old mechs
            mechScrap = "none";
        } else if (settings.mechScrap === "mixed") {
            if (buildings.SpireWaygate.stateOnCount === 1) {
                // No mass scrapping during Demon Lord fight, all mechs equially good here - stay with full bay
                mechScrap = "single";
            } else {
                let mechToBuild = Math.floor(baySpace / newSpace);
                let supplyCost = mechToBuild * newSupply;
                if (settings.mechSaveSupply) { // If we're going to save up supplies we need to reserve time for it
                    supplyCost += resources.Supply.maxQuantity;
                }
                let timeToFullBay = Math.max((supplyCost - resources.Supply.currentQuantity) / resources.Supply.rateOfChange,
                              (mechToBuild * newGems - resources.Soul_Gem.currentQuantity) / resources.Soul_Gem.rateOfChange);
                // timeToClear changes drastically with new mechs, let's try to normalize it, scaling it with available power
                let estimatedTotalPower = m.mechsPower + mechToBuild * newMech.power;
                let estimatedTimeToClear = m.getTimeToClear() * (m.mechsPower / estimatedTotalPower);
                mechScrap = timeToFullBay > estimatedTimeToClear && !lastFloor ? "single" : "all";
            }
        }

        // Check if we need to scrap anything
        if (newSupply < resources.Supply.spareMaxQuantity && ((mechScrap === "single" && baySpace < newSpace) || (mechScrap === "all" && (baySpace < newSpace || resources.Supply.spareQuantity < newSupply || resources.Soul_Gem.spareQuantity < newGems)))) {
            let spaceGained = 0;
            let supplyGained = 0;
            let gemsGained = 0;
            let powerLost = 0;

            // Get list of inefficient mech
            let scrapEfficiency =
              baySpace === 0 && resources.Supply.storageRatio > 0.9 ? 0 :
              lastFloor ? Math.min(settings.mechScrapEfficiency, 1) :
              settings.mechScrapEfficiency;

            let badMechList = m.activeMechs.filter(mech => {
                if (mech.infernal || mech.power >= m.bestMech[mech.size].power) {
                    return false;
                }
                let [gemRefund, supplyRefund] = m.getMechRefund(mech);
                // Collector and scout does not refund gems. Let's pretend they're returning half of gem during filtering
                let costRatio = Math.min((gemRefund || 0.5) / newGems, supplyRefund / newSupply);
                let powerRatio = mech.power / newMech.power;
                return costRatio / powerRatio > scrapEfficiency;
            }).sort((a, b) => a.efficiency - b.efficiency);
            // TODO: Preserve min amount of scouts

            // Remove worst mechs untill we have enough room for new mech
            let trashMechs = [];
            for (let i = 0; i < badMechList.length && (baySpace + spaceGained < newSpace || (mechScrap === "all" && (resources.Supply.spareQuantity + supplyGained < newSupply || resources.Soul_Gem.spareQuantity + gemsGained < newGems))); i++) {
                spaceGained += m.getMechSpace(badMechList[i]);
                supplyGained += m.getMechRefund(badMechList[i])[1];
                gemsGained += m.getMechRefund(badMechList[i])[0];
                powerLost += badMechList[i].power;
                trashMechs.push(badMechList[i]);
            }

            // Now go scrapping, if possible and benefical
            if (trashMechs.length > 0 && powerLost / spaceGained < newMech.efficiency && baySpace + spaceGained >= newSpace && resources.Supply.spareQuantity + supplyGained >= newSupply && resources.Soul_Gem.spareQuantity + gemsGained >= newGems) {
                trashMechs.sort((a, b) => b.id - a.id); // Goes from bottom to top of the list, so it won't shift IDs
                if (trashMechs.length > 1) {
                    let rating = average(trashMechs.map(mech => mech.power / m.bestMech[mech.size].power));
                    GameLog.logSuccess(GameLog.Types.mech_scrap, `${trashMechs.length} mechs (~${Math.round(rating * 100)}%) has been scrapped.`);
                } else {
                    GameLog.logSuccess(GameLog.Types.mech_scrap, `${m.mechDesc(trashMechs[0])} mech has been scrapped.`);
                }
                trashMechs.forEach(mech => m.scrapMech(mech));
                resources.Supply.currentQuantity = Math.min(resources.Supply.currentQuantity + supplyGained, resources.Supply.maxQuantity);
                resources.Soul_Gem.currentQuantity += gemsGained;
                // TODO: Workaround for scrap vue bug - it doesn't update used space in callback. Remove when fixed.
                baySpace += spaceGained;
                m._assemblyVue.m.bay -= spaceGained;
            } else if (baySpace + spaceGained >= newSpace) {
                return; // We have scrapable mechs, but don't want to scrap them right now. Waiting for more supplies for instant replace.
            }
        }

        // Try to squeeze smaller mech, if we can't fit preferred one
        if (settings.mechFillBay && ((!canExpandBay && baySpace < newSpace) || resources.Supply.maxQuantity < newSupply)) {
            for (let i = m.Size.indexOf(newMech.size) - 1; i >= 0; i--) {
                [newGems, newSupply, newSpace] = m.getMechCost({size: m.Size[i]});
                if (newSpace <= baySpace && newSupply <= resources.Supply.maxQuantity) {
                    newMech = m.getRandomMech(m.Size[i]);
                    break;
                }
            }
        }

        // We have everything to get new mech
        if (resources.Soul_Gem.spareQuantity >= newGems && resources.Supply.spareQuantity >= newSupply && baySpace >= newSpace) {
            if (settings.mechBuild !== "user" && mechBay.blueprint.infernal) {
                $("#mechAssembly .b-checkbox").click(); // Never build inferno mechs
            }
            m.buildMech(newMech);
            resources.Supply.currentQuantity -= newSupply;
            resources.Soul_Gem.currentQuantity -= newGems;
            m.isActive = prolongActive;
            return;
        }
    }

    function updateScriptData() {
        for (let id in resources) {
            resources[id].updateData();
        }

        // Money is special. They aren't defined as tradable, but still affected by trades
        if (settings.autoMarket) {
            let moneyDiff = game.breakdown.p.consume["Money"];
            if (moneyDiff.Trade){
                resources.Money.tradeIncome = moneyDiff.Trade;
                resources.Money.rateOfChange -= moneyDiff.Trade;
            }
        }

        state.maxSpaceMiners = 0;
        // Parse global production modifiers
        state.globalProductionModifier = 1;
        for (let mod of Object.values(game.breakdown.p.Global)) {
            state.globalProductionModifier *= 1 + (parseFloat(mod) || 0) / 100;
        }

        // Add clicking to rate of change, so we can sell or eject it.
        if (settings.buildingAlwaysClick || (settings.autoBuild && (resources.Population.currentQuantity <= 15 || (buildings.RockQuarry.count < 1 && !game.global.race['sappy'])))) {
            let resPerClick = getResourcesPerClick() / gameTicksPerSecond("mid");
            if (buildings.Food.isClickable()) {
                resources.Food.rateOfChange += resPerClick * settings.buildingClickPerTick * (haveTech("conjuring", 1) ? 10 : 1);
            }
            if (buildings.Lumber.isClickable()) {
                resources.Lumber.rateOfChange += resPerClick * settings.buildingClickPerTick  * (haveTech("conjuring", 2) ? 10 : 1);
            }
            if (buildings.Stone.isClickable()) {
                resources.Stone.rateOfChange += resPerClick * settings.buildingClickPerTick  * (haveTech("conjuring", 2) ? 10 : 1);
            }
            if (buildings.Chrysotile.isClickable()) {
                resources.Chrysotile.rateOfChange += resPerClick * settings.buildingClickPerTick  * (haveTech("conjuring", 2) ? 10 : 1);
            }
            if (buildings.Slaughter.isClickable()){
                resources.Lumber.rateOfChange += resPerClick * settings.buildingClickPerTick;
                if (game.global.race['soul_eater'] && haveTech("primitive", 2)){
                    resources.Food.rateOfChange += resPerClick * settings.buildingClickPerTick;
                }
                if (resources.Furs.isUnlocked()) {
                    resources.Furs.rateOfChange += resPerClick * settings.buildingClickPerTick;
                }
            }
        }

        WarManager.updateData();
        MarketManager.updateData();
    }

    function calculateRequiredStorages() {
        if (settings.storagePrioritizedOnly) {
            return;
        }
        let bufferMult = settings.storageAssignExtra ? 1.03 : 1;

        // Get list of all unlocked techs, and find biggest numbers for each resource
        // Required amount increased by 3% from actual numbers, as other logic of script can and will try to prevent overflowing by selling\ejecting\building projects, and that might cause an issues if we'd need 100% of storage
        $("#tech .action").each(function() {
            let tech = techIds[this.id];
            tech.updateResourceRequirements();
            if (!isTechAllowed(tech) && !state.triggerTargets.includes(tech)) {
                return;
            }
            tech.resourceRequirements.forEach(requirement => {
                requirement.resource.storageRequired = Math.max(requirement.quantity*bufferMult, requirement.resource.storageRequired);
            });
        });

        // We need to preserve amount of knowledge required by techs only, while amount still not polluted
        // by buildings - wardenclyffe, labs, etc. This way we can determine what's our real demand is.
        // Otherwise they might start build up knowledge cap just to afford themselves, increasing required
        // cap further, so we'll need more labs, and they'll demand even more knowledge for next level and so on.
        state.knowledgeRequiredByTechs = resources.Knowledge.storageRequired;

        // Now we're checking costs of buildings
        BuildingManager.priorityList.forEach(building => {
            if (building.isUnlocked() && building.autoBuildEnabled){
                let unaffordableReq = building.resourceRequirements.find(req => req.resource.maxQuantity < req.quantity && !req.resource.hasStorage());
                if (!unaffordableReq) {
                    building.resourceRequirements.forEach(requirement => {
                        requirement.resource.storageRequired = Math.max(requirement.quantity*bufferMult, requirement.resource.storageRequired);
                    });
                }
            }
        });

        // Same for projects
        ProjectManager.priorityList.forEach(project => {
            if (project.isUnlocked() && project.autoBuildEnabled) {
                project.resourceRequirements.forEach(requirement => {
                    requirement.resource.storageRequired = Math.max(requirement.quantity*bufferMult, requirement.resource.storageRequired);
                });
            }
        });

        // Increase storage for sellable resources, to make sure we'll have required amount before they'll be sold
        if (!game.global.race['no_trade'] && settings.autoMarket) {
            for (let id in resources) {
                if (resources[id].autoSellEnabled && resources[id].autoSellRatio > 0) {
                    resources[id].storageRequired /= resources[id].autoSellRatio;
                }
            }
        }
    }

    function prioritizeDemandedResources() {
        let prioritizedTasks = [];
        // Building and research queues
        if (settings.queueRequest) {
            prioritizedTasks.push(...state.queuedTargets);
        }
        // Active triggers
        if (settings.triggerRequest) {
            prioritizedTasks.push(...state.triggerTargets);
        }
        // Unlocked missions
        if (settings.missionRequest) {
            for (let i = state.missionBuildingList.length - 1; i >= 0; i--) {
                let mission = state.missionBuildingList[i];
                if (mission.isUnlocked() && mission.autoBuildEnabled && (mission !== buildings.BlackholeJumpShip || !settings.prestigeBioseedConstruct || settings.prestigeType !== "whitehole")) {
                    prioritizedTasks.push(mission);
                } else if (mission.isComplete()) { // Mission finished, remove it from list
                    state.missionBuildingList.splice(i, 1);
                }
            }
        }

        // Unlocked and affordable techs, and but only if we don't have anything more important
        if (prioritizedTasks.length === 0 && (haveTech("mad") ? settings.researchRequestSpace : settings.researchRequest)) {
            $("#tech .action:not(.cnam)").each(function() {
                let tech = techIds[this.id];
                if (isTechAllowed(tech)) {
                    prioritizedTasks.push(tech);
                }
            });
        }

        if (prioritizedTasks.length > 0) {
            for (let i = 0; i < prioritizedTasks.length; i++){
                let demandedObject = prioritizedTasks[i];
                for (let j = 0; j < demandedObject.resourceRequirements.length; j++) {
                    let req = demandedObject.resourceRequirements[j];
                    let resource = req.resource;
                    let required = req.quantity;
                    // Double request for project, to make it smoother
                    if (demandedObject instanceof Project && demandedObject.progress < 99) {
                        required *= 2;
                    }
                    resource.requestedQuantity = Math.max(resource.requestedQuantity, required);
                }
            }
        }

        // Prioritize material for craftables
        for (let id in resources) {
            let resource = resources[id];
            if (resource.isDemanded()) {
                // Only craftables stores their cost in resourceRequirements, no need for additional checks
                for (let i = 0; i < resource.resourceRequirements.length; i++) {
                    let material = resource.resourceRequirements[i].resource;
                    material.requestedQuantity = Math.max(material.requestedQuantity, material.maxQuantity * (resource.craftPreserve + 0.05));
                }
            }
        }

        // Prioritize some factory materials when needed
        let factoryThreshold = settings.productionFactoryMinIngredients + 0.01;
        if (resources.Stanene.isDemanded() && resources.Nano_Tube.storageRatio < factoryThreshold) {
            resources.Nano_Tube.requestedQuantity = Math.max(resources.Nano_Tube.requestedQuantity, resources.Nano_Tube.maxQuantity * factoryThreshold);
        }
        if (resources.Nano_Tube.isDemanded() && resources.Coal.storageRatio < factoryThreshold) {
            resources.Coal.requestedQuantity = Math.max(resources.Coal.requestedQuantity, resources.Coal.maxQuantity * factoryThreshold);
        }
        if (resources.Furs.isDemanded() && resources.Polymer.storageRatio < factoryThreshold) {
            resources.Polymer.requestedQuantity = Math.max(resources.Polymer.requestedQuantity, resources.Polymer.maxQuantity * factoryThreshold);
        }
        // TODO: Prioritize missing consumptions of buildings
        // Force crafting Stanene up to 3% when we have Vitreloy Plants
        if (resources.Stanene.storageRatio < 0.03 && buildings.Alien1VitreloyPlant.count > 0) {
            resources.Stanene.requestedQuantity = resources.Stanene.maxQuantity;
        }
    }

    function updatePriorityTargets() {
        state.otherTargets = [];
        state.queuedTargets = [];
        // Buildings queue
        let bufferMult = settings.storageAssignExtra ? 1.03 : 1;
        if (game.global.queue.display) {
            for (let i = 0; i < game.global.queue.queue.length; i++) {
                let id = game.global.queue.queue[i].id;
                let obj = buildingIds[id] || arpaIds[id];
                if (obj) {
                    obj.resourceRequirements.forEach(requirement => {
                        requirement.resource.storageRequired = Math.max(requirement.quantity*bufferMult, requirement.resource.storageRequired);
                    });
                    if (obj.isAffordable(true)) {
                        state.queuedTargets.push(obj);
                    }
                }
                if (!game.global.settings.qAny) {
                    break;
                }
            }
        }
        // Research queue
        if (game.global.r_queue.display) {
            for (let i = 0; i < game.global.r_queue.queue.length; i++) {
                let id = game.global.r_queue.queue[i].id;
                let obj = techIds[id];
                if (obj) {
                    obj.resourceRequirements.forEach(requirement => {
                        requirement.resource.storageRequired = Math.max(requirement.quantity*bufferMult, requirement.resource.storageRequired);
                    });
                    if (obj.isAffordable(true)) {
                        state.queuedTargets.push(obj);
                    }
                }
                if (!game.global.settings.qAny_res) {
                    break;
                }
            }
        }

        TriggerManager.resetTargetTriggers();

        state.triggerTargets = [];
        // Active triggers
        for (let i = 0; i < TriggerManager.targetTriggers.length; i++) {
            let trigger = TriggerManager.targetTriggers[i];
            if (trigger.actionType === "research" && techIds[trigger.actionId]) {
                state.triggerTargets.push(techIds[trigger.actionId]);
            }
            if (trigger.actionType === "build" && buildingIds[trigger.actionId]) {
                state.triggerTargets.push(buildingIds[trigger.actionId]);
            }
            if (trigger.actionType === "arpa" && arpaIds[trigger.actionId]) {
                state.triggerTargets.push(arpaIds[trigger.actionId]);
            }
        }
    }

    function checkEvolutionResult() {
        if (settings.autoEvolution && settings.evolutionBackup){
            let needReset = false;

            if (settings.userEvolutionTarget === "auto") {
                let stars = game.alevel();
                let newRace = races[game.global.race.species];

                if ((settings.prestigeType === "ascension" || settings.prestigeType === "demonic") && newRace.isPillarUnlocked(stars)) {
                    for (let id in races) {
                        let race = races[id];
                        if (race.getHabitability() > 0 && !race.isPillarUnlocked(stars)) {
                            GameLog.logWarning(GameLog.Types.special, `${newRace.name} pillar already infused, soft resetting and trying again.`);
                            needReset = true;
                            break;
                        }
                    }
                    if (!needReset) {
                        GameLog.logWarning(GameLog.Types.special, `All currently available pillars already infused. Continuing with current race.`);
                    }
                }

                if (settings.prestigeType === "bioseed" && newRace.isGreatnessAchievementUnlocked(stars)) {
                    for (let id in races) {
                        let race = races[id];
                        if (race.getHabitability() > 0 && !race.isGreatnessAchievementUnlocked(stars)) {
                            GameLog.logWarning(GameLog.Types.special, `${newRace.name} greatness achievement already earned, soft resetting and trying again.`);
                            needReset = true;
                            break;
                        }
                    }
                    if (!needReset) {
                        GameLog.logWarning(GameLog.Types.special, `All currently available greatness achievements already earned. Continuing with current race.`);
                    }
                }

                if (settings.prestigeType !== "bioseed" && settings.prestigeType !== "ascension" && settings.prestigeType !== "demonic" && newRace.isMadAchievementUnlocked(stars)) {
                    for (let id in races) {
                        let race = races[id];
                        if (race.getHabitability() > 0 && !race.isMadAchievementUnlocked(stars)) {
                            GameLog.logWarning(GameLog.Types.special, `${newRace.name} extinction achievement already earned, soft resetting and trying again.`);
                            needReset = true;
                            break;
                        }
                    }
                    if (!needReset) {
                        GameLog.logWarning(GameLog.Types.special, `All currently available extinction achievements already earned. Continuing with current race.`);
                    }
                }

            } else if (settings.userEvolutionTarget !== game.global.race.species && races[settings.userEvolutionTarget].getHabitability() > 0) {
                GameLog.logWarning(GameLog.Types.special, `Wrong race, soft resetting and trying again.`);
                needReset = true;
            }

            if (needReset) {
                // Let's double check it's actually *soft* reset
                let resetButton = document.querySelector(".reset .button:not(.right)");
                if (resetButton.innerText === game.loc("reset_soft")) {
                    if (settings.evolutionQueueEnabled && settings.evolutionQueue.length > 0) {
                        addEvolutionSetting();
                        settings.evolutionQueue.unshift(settings.evolutionQueue.pop());
                    }
                    updateSettingsFromState();

                    state.goal = "GameOverMan";
                    resetButton.disabled = false;
                    resetButton.click();
                    return false;
                }
            }
        }
        return true;
    }

    function updateTabs() {
        state.lastShowMarket = game.global.settings.showMarket;
        state.lastShowRoutes = game.global.city.market.active;
        state.lastShowEjector = game.global.settings.showEjector;
        state.lastShowCargo = game.global.settings.showCargo;
        state.lastHaveCrate = resources.Crates.isUnlocked();
        state.lastHaveContainer = resources.Containers.isUnlocked();
    }

    function updateState() {
        if (game.global.race.species === "protoplasm") {
            state.goal = "Evolution";
        } else if (state.goal === "Evolution") {
            // Check what we got after evolution
            if (!checkEvolutionResult()) {
                return;
            }
            state.goal = "Standard";
            if (settings.triggers.length > 0) { // We've moved from evolution to standard play. There are technology descriptions that we couldn't update until now.
                updateTriggerSettingsContent();
            }
            if (settings.evolutionQueue.length > 0) { // Update star icons, we didn't had them in evolution, and used placeholder
                updateEvolutionSettingsContent();
            }
        }

        // TODO:Some object doesn't updates when needed. Forcing page reload when it happens. Remove me once it's fixed in game.
        if ((state.lastLumber !== isLumberRace() && game.global.galaxy.trade) // Outdated galaxyOffers
              || state.lastWasteful !== game.global.race.wasteful) { // Outdated craftCost
            state.goal = "GameOverMan";
            setTimeout(()=> window.location.reload(), 5000);
            return;
        }
        // Redraw tabs once they unlocked
        if ((game.global.race['smoldering'] && buildings.RockQuarry.count > 0 && $("#iQuarry").length === 0)
              || state.lastShowMarket !== game.global.settings.showMarket
              || state.lastShowRoutes !== game.global.city.market.active
              || state.lastShowEjector !== game.global.settings.showEjector
              || state.lastShowCargo !== game.global.settings.showCargo
              || (!state.lastHaveCrate && resources.Crates.isUnlocked())
              || (!state.lastHaveContainer && resources.Containers.isUnlocked())) {
            updateTabs();
            let mainVue = $('#mainColumn > div:first-child')[0].__vue__;
            mainVue.s.civTabs = 7;
            $(".settings11").click().click();
            mainVue.s.civTabs = game.global.settings.civTabs;
        }

        updateScriptData(); // Sync exposed data with script variables

        // Reset required storage and prioritized resources
        for (let id in resources) {
            resources[id].storageRequired = 1;
            resources[id].requestedQuantity = 0;
        }
        state.eleriumCosts = [];
        updatePriorityTargets();  // Set queuedTargets and triggerTargets
        BuildingManager.updateBuildings(); // Set obj.resourceRequirements
        ProjectManager.updateProjects(); // Set obj.resourceRequirements, uses triggerTargets
        calculateRequiredStorages(); // Uses obj.resourceRequirements
        prioritizeDemandedResources(); // Set res.requestedQuantity, uses queuedTargets and triggerTargets

        state.moneyIncomes.push(resources.Money.rateOfChange);
        state.moneyIncomes.shift();
        state.moneyMedian = average(state.moneyIncomes);

        // This comes from the "const towerSize = (function(){" in portal.js in the game code
        let towerSize = 1000;
        if (game.global.hasOwnProperty('pillars')){
            for (let pillar in game.global.pillars) {
                if (game.global.pillars[pillar]){
                    towerSize -= 12;
                }
            }
        }

        buildings.GateEastTower.gameMax = towerSize;
        buildings.GateWestTower.gameMax = towerSize;

        // Space dock is special and has a modal window with more buildings!
        if (!buildings.GasSpaceDock.isOptionsCached()) {
            buildings.GasSpaceDock.cacheOptions();
        }
    }

    function verifyGameActions() {
        // Check that actions that exist in game also exist in our script
        verifyGameActionsExist(game.actions.city, buildings, false);
        verifyGameActionsExist(game.actions.space, buildings, true);
        verifyGameActionsExist(game.actions.interstellar, buildings, true);
        verifyGameActionsExist(game.actions.portal, buildings, true);
        verifyGameActionsExist(game.actions.galaxy, buildings, true);
    }

    function verifyGameActionsExist(gameObject, scriptObject, hasSubLevels) {
        let scriptKeys = Object.keys(scriptObject);
        for (let gameActionKey in gameObject) {
            if (!hasSubLevels) {
                verifyGameActionExists(scriptKeys, scriptObject, gameActionKey, gameObject);
            } else {
                // This object has sub levels - iterate through them
                let gameSubObject = gameObject[gameActionKey];
                for (let gameSubActionKey in gameSubObject) {
                    verifyGameActionExists(scriptKeys, scriptObject, gameSubActionKey, gameSubObject);
                }
            }
        }
    }

    function verifyGameActionExists(scriptKeys, scriptObject, gameActionKey, gameObject) {
        // We know that we don't have the info objects defined in our script
        // XXXX is special. The key doesn't match the object in the game code
        // gift is a special santa gift. Leave it to the player.
        if (gameActionKey === "info" || gameActionKey === "gift") {
            return;
        }

        let scriptActionFound = false;

        for (let i = 0; i < scriptKeys.length; i++) {
            const scriptAction = scriptObject[scriptKeys[i]];
            if (scriptAction.id === gameActionKey) {
                scriptActionFound = true;
                break;
            }
        }

        if (!scriptActionFound) {
            console.log("Game action key not found in script: " + gameActionKey + " (" + gameObject[gameActionKey].id + ")");
            console.log(gameObject[gameActionKey]);
        }
    }

    function initialiseScript() {
        // Init researches
        for (let [key, action] of Object.entries(game.actions.tech)) {
            techIds[action.id] = new Technology(key);
        }

        // Init lookup table for buildings
        for (let building of Object.values(buildings)){
            buildingIds[building._vueBinding] = building;
            // Don't force building Jump Ship and Pit Assault, they're prety expensive at the moment when unlocked.
            if (building.isMission() && building !== buildings.BlackholeJumpShip && building !== buildings.PitAssaultForge) {
                state.missionBuildingList.push(building);
            }
        }

        // ...and projects
        for (let project of Object.values(projects)){
            arpaIds[project._vueBinding] = project;
        }

        updateStateFromSettings();
        updateSettingsFromState();

        TriggerManager.priorityList.forEach(trigger => {
            trigger.complete = false;
        });

        // If debug logging is enabled then verify the game actions code is both correct and in sync with our script code
        if (showLogging) {
            verifyGameActions();
        }

        // Set up our sorted resource atomic mass array
        for (let id in resources) {
            let resource = resources[id];

            if (resource.isSupply()) {
                resourcesBySupplyValue.push(resource);
            }

            // We'll add these exotic resources to the front of the list after sorting as these should always come first
            if (resource.isEjectable() && resource !== resources.Elerium && resource !== resources.Infernite) {
                resourcesByAtomicMass.push(resource);
            }
        }
        resourcesBySupplyValue.sort((a, b) => b.supplyValue - a.supplyValue);
        resourcesByAtomicMass.sort((a, b) => b.atomicMass - a.atomicMass);
        // Elerium and infernite are always first as they are the exotic resources which are worth the most DE
        resourcesByAtomicMass.unshift(resources.Infernite);
        resourcesByAtomicMass.unshift(resources.Elerium);

        // Normal popups
        new MutationObserver(addTooltip).observe(document.getElementById("main"), {childList: true});

        // Modals; check script callbacks and add Space Dock tooltips
        new MutationObserver(bodyMutations =>  bodyMutations.forEach(bodyMutation => bodyMutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains("modal")) {
                if (WindowManager.openedByScript) {
                    node.style.display = "none"; // Hide splash
                    new MutationObserver(WindowManager.checkCallbacks).observe(document.getElementById("modalBox"), {childList: true});
                } else {
                    new MutationObserver(addTooltip).observe(node, {childList: true});
                }
            }
        }))).observe(document.querySelector("body"), {childList: true});

        // Log filtering
        buildFilterRegExp();
        new MutationObserver(filterLog).observe(document.getElementById("msgQueue"), {childList: true});
    }

    function buildFilterRegExp() {
        let regexps = [];
        let validIds = [];
        let strings = settings.logFilter.split(/[^0-9a-z_]/g).filter(Boolean);
        for (let i = 0; i < strings.length; i++) {
            let id = strings[i];
            // Loot message built from multiple strings without tokens, let's fake one for regexp below
            let message = game.loc(id) + (id === "civics_garrison_gained" ? "%0" : "");
            if (message === id) {
                continue;
            }
            regexps.push(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%\d/g, ".*"));
            validIds.push(id);
        }
        if (regexps.length > 0) {
            state.filterRegExp = new RegExp("^(" + regexps.join("|") + ")$");
            settings.logFilter = validIds.join(", ");
        } else {
            state.filterRegExp = null;
            settings.logFilter = "";
        }
    }

    function filterLog(mutations) {
        if (!settings.masterScriptToggle || !state.filterRegExp) {
            return;
        }
        mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
            if (state.filterRegExp.test(node.innerText)) {
                node.remove();
            }
        }));
    }

    function getWorldColliderMulti() {
        let boost = 0

        if (buildings.DwarfWorldController.stateOnCount) {
            boost = 0.25;
            boost += buildings.BlackholeFarReach.stateOnCount * 0.01;
            boost += haveTech('science', 19) ? 0.15 : 0;
        }

        return 1 + boost;
    }

    function wardenLabel() {
        if (game.global.race.universe === 'magic') {
            return game.loc('city_wizard_tower_title');
        } else {
            return game.global.race['evil'] ? game.loc('city_babel_title') : game.loc('city_wardenclyffe');
        }
    }

    function getTooltipInfo(obj) {
        let notes = [];
        if (obj === buildings.NeutronCitadel) {
            notes.push(`Next level will increase total consumption by ${getCitadelConsumption(obj.stateOnCount+1) - getCitadelConsumption(obj.stateOnCount)} MW`);
        }
        if (obj === buildings.SpireMechBay && MechManager.initLab()) {
            notes.push(`Currrent team potential: ${getNiceNumber(MechManager.mechsPotential)}`);
        }



        if (obj === buildings.University) {
            let gain = 0;

            if (buildings.University.count === 0) {
                gain += parseFloat(game.actions.city.university.effect().match(/(?<=\+)[0-9]+(?= Max Knowledge)/)[0]);
            } else {
                gain += parseFloat(game.breakdown.c.Knowledge[game.loc('city_university')]) / buildings.University.count;
            }

            gain *= getWorldColliderMulti();

            notes.push(`+${Math.round(gain)} Max Knowledge`);
        }



        if (obj === buildings.Library) {
            let gain = 0;

            if (buildings.Library.count === 0) {
                gain += parseFloat(game.actions.city.library.effect().match(/(?<=\+)[0-9]+(?= Max Knowledge)/)[0]);
            } else {
                gain += parseFloat(game.breakdown.c.Knowledge[game.loc('city_library')]) / buildings.Library.count;
            }

            if (haveTech('science', 4)) {
                gain += 0.02 * parseFloat(game.breakdown.c.Knowledge[game.loc('city_university')] ?? 0) / (1
                    + buildings.Library.count * 0.02
                    + buildings.MoonObservatory.stateOnCount * 0.05
                    + (haveTech('science', 14) ? buildings.BadlandsSensorDrone.stateOnCount * 0.02 : 0));
            }

            gain *= getWorldColliderMulti();

            notes.push(`+${Math.round(gain)} Max Knowledge`);
        }



        if (obj === buildings.Wardenclyffe) {
            let gain = 0;

            if (buildings.Wardenclyffe.count === 0) {
                gain += parseFloat(game.actions.city.wardenclyffe.effect().match(/(?<=\+)[0-9]+(?= Max Knowledge)/)[0]);
            } else {
                gain += parseFloat(game.breakdown.c.Knowledge[wardenLabel()]) / buildings.Wardenclyffe.count;
            }

            if (haveTech('science', 15)) {
                gain += 0.02 * parseFloat(game.breakdown.c.Knowledge[game.loc(game.global.race.universe === 'magic' ? 'tech_sanctum' : 'interstellar_laboratory_title')] ?? 0) / (1
                    + buildings.Wardenclyffe.count * 0.02);
            }

            gain *= getWorldColliderMulti();

            notes.push(`+${Math.round(gain)} Max Knowledge`);
        }



        if (obj === buildings.SpaceSatellite) {
            let gain = 0;

            if (buildings.SpaceSatellite.count === 0) {
                gain += parseFloat(game.actions.space.spc_home.satellite.effect().match(/(?<=\+)[0-9]+(?= Max Knowledge)/)[0]);
            } else {
                gain += parseFloat(game.breakdown.c.Knowledge[game.loc('space_home_satellite_title')]) / buildings.SpaceSatellite.count;
            }

            gain += 0.04 * parseFloat(game.breakdown.c.Knowledge[wardenLabel()] ?? 0) / (1
                + buildings.SpaceSatellite.count * 0.04);


            gain *= getWorldColliderMulti();

            notes.push(`+${Math.round(gain)} Max Knowledge`);
        }



        if (obj === buildings.MoonObservatory) {
            let gain = 0;

            if (buildings.MoonObservatory.stateOnCount === 0) {
                gain += parseFloat(game.actions.space.spc_moon.observatory.effect().match(/(?<=\+)[0-9]+(?= Max Knowledge)/)[0]);
            } else {
                gain += parseFloat(game.breakdown.c.Knowledge[game.loc('space_moon_observatory_title')]) / buildings.MoonObservatory.stateOnCount;
            }

            gain += 0.05 * parseFloat(game.breakdown.c.Knowledge[game.loc('city_university')] ?? 0) / (1
                + buildings.Library.count * (haveTech('science', 4) ? 0.02 : 0)
                + buildings.MoonObservatory.stateOnCount * 0.05
                + (haveTech('science', 14) ? buildings.BadlandsSensorDrone.stateOnCount * 0.02 : 0));

            if (game.global.race['cataclysm']) {
                gain += 0.25 * parseFloat(game.breakdown.c.Knowledge[game.loc('tech_exotic_bd')] ?? 0) / (1
                    + buildings.MoonObservatory.stateOnCount * 0.25);
            }

            gain *= getWorldColliderMulti();

            notes.push(`+${Math.round(gain)} Max Knowledge`);
        }



        if (obj === buildings.RedExoticLab) {
            let gain = 0;

            if (buildings.RedExoticLab.stateOnCount === 0) {
                gain += parseFloat(game.actions.space.spc_red.exotic_lab.effect().match(/(?<=\+)[0-9]+(?= Max Knowledge)/)[0]) * jobs.Colonist.count;
            } else {
                gain += parseFloat(game.breakdown.c.Knowledge[game.loc('tech_exotic_bd')]) / buildings.RedExoticLab.stateOnCount;
            }

            if (game.global.race['cataclysm'] && haveTech('science', 15)) {
                gain += 0.02 * parseFloat(game.breakdown.c.Knowledge[game.loc(game.global.race.universe === 'magic' ? 'tech_sanctum' : 'interstellar_laboratory_title')] ?? 0) / (1
                    + buildings.RedExoticLab.stateOnCount * 0.02);
            }

            gain *= getWorldColliderMulti();

            notes.push(`+${Math.round(gain)} Max Knowledge`);
        }



        if (obj === buildings.AlphaLaboratory) {
            let gain = 0;

            if (buildings.AlphaLaboratory.stateOnCount === 0) {
                gain += parseFloat(game.actions.interstellar.int_alpha.laboratory.effect().match(/(?<=\+)[0-9]+(?= Max Knowledge)/)[0]);
            } else {
                gain += parseFloat(game.breakdown.c.Knowledge[game.loc(game.global.race.universe === 'magic' ? 'tech_sanctum' : 'interstellar_laboratory_title')]) / buildings.AlphaLaboratory.stateOnCount;
            }

            gain += 0.05 * parseFloat(game.breakdown.c.Knowledge[game.loc('tech_exotic_bd')] ?? 0) / (1
                + (haveTech('science', 13) ? buildings.AlphaLaboratory.stateOnCount * 0.05 : 0)
                + (haveTech('ancient_study', 2) ? buildings.RedZiggurat.stateOnCount * 0.03 : 0)
                + (haveTech('mass', 2) ? buildings.MassDriver.stateOnCount * jobs.Scientist.count * 0.002 : 0));

            gain *= getWorldColliderMulti();

            notes.push(`+${Math.round(gain)} Max Knowledge`);
        }



        if (obj === buildings.BlackholeFarReach) {
            let gain = 0;

            gain += 0.01 * resources.Knowledge.maxQuantity / getWorldColliderMulti();

            notes.push(`+${Math.round(gain)} Max Knowledge`);
        }



        if (obj === buildings.StargateTelemetryBeacon) {
            let gain = 0;

            let base_val = haveTech('telemetry') ? 1200 : 800;
            if (haveTech('science', 17)) {
                base_val += buildings.ScoutShip.stateOnCount * 25;
            }
            gain += (buildings.StargateTelemetryBeacon.stateOnCount * 2 + 1) * base_val;

            gain *= getWorldColliderMulti();

            notes.push(`+${Math.round(gain)} Max Knowledge`);
        }



        if (obj === buildings.BadlandsSensorDrone && haveTech('science', 14)) {
            let gain = 0;

            if (buildings.BadlandsSensorDrone.stateOnCount === 0) {
                gain += parseFloat(game.actions.portal.prtl_badlands.sensor_drone.effect().match(/(?<=\+)[0-9]+(?= Max Knowledge)/)[0]);
            } else {
                gain += parseFloat(game.breakdown.c.Knowledge[game.loc('portal_sensor_drone_title')]) / buildings.BadlandsSensorDrone.stateOnCount;
            }

            gain += 0.02 * parseFloat(game.breakdown.c.Knowledge[game.loc('city_university')] ?? 0) / (1
                + buildings.Library.count * 0.02
                + buildings.MoonObservatory.stateOnCount * 0.05
                + buildings.BadlandsSensorDrone.stateOnCount * 0.02);

            if (game.global.race['cataclysm']) {
                gain += 0.02 * parseFloat(game.breakdown.c.Knowledge[game.loc('tech_exotic_bd')] ?? 0) / (1
                    + buildings.BadlandsSensorDrone.stateOnCount * 0.02);
            } else {
                gain += 0.02 * parseFloat(game.breakdown.c.Knowledge[game.loc('city_biolab')] ?? 0) / (1
                    + buildings.BadlandsSensorDrone.stateOnCount * 0.02);
            }

            gain *= getWorldColliderMulti();

            notes.push(`+${Math.round(gain)} Max Knowledge`);
        }

        

        // Other tooltips goes here...



        if ((obj instanceof Technology || (!settings.autoARPA && obj._tab === "arpa") || (!settings.autoBuild && obj._tab !== "arpa")) && !state.queuedTargets.includes(obj) && !state.triggerTargets.includes(obj)) {
            let conflict = getCostConflict(obj);
            if (conflict) {
                notes.push(`Conflicts with ${conflict.target.title} for ${conflict.res.name} (${conflict.cause})`);
            }
        }
        if (obj instanceof Technology && settings.researchIgnore.includes(obj._vueBinding)) {
            notes.push("Ignored research");
        }

        if (obj.extraDescription) {
            notes.push(obj.extraDescription);
        }
        return notes.join("<br>");
    }

    const infusionStep = {"blood-lust": 15, "blood-illuminate": 12, "blood-greed": 16, "blood-hoarder": 14, "blood-artisan": 8, "blood-attract": 4, "blood-wrath": 2};
    function addTooltip(mutations) {
        if (!settings.masterScriptToggle) {
            return;
        }
        mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
            if (node.id === "popper") {
                let dataId = node.dataset.id;
                // Tooltips for things with no script objects
                if (dataId === 'powerStatus') {
                    node.innerHTML += `<p class="modal_bd"><span>Disabled</span><span class="has-text-danger">${getNiceNumber(resources.Power.maxQuantity)}</span></p>`;
                    return;
                } else if (infusionStep[dataId]) {
                    let BloodStone = game.loc('resource_Blood_Stone_name').replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                    node.innerHTML = node.innerHTML.replace(new RegExp(`${BloodStone}: \\d+`), `$& (+${infusionStep[dataId]})`);
                    return;
                }

                let match = null;
                let obj = null;
                if (match = dataId.match(/^popArpa([a-z_-]+)\d*$/)) { // "popArpa[id-with-no-tab][quantity]" for projects
                    obj = arpaIds["arpa" + match[1]];
                } else if (match = dataId.match(/^q([a-z_-]+)\d*$/)) { // "q[id][order]" for buildings in queue
                    obj = buildingIds[match[1]] || arpaIds[match[1]];
                } else { // "[id]" for buildings and researches
                    obj = buildingIds[dataId] || techIds[dataId];
                }
                if (!obj || (obj instanceof Technology && obj.isResearched())) {
                    return;
                }

                // Flair, added before other descriptions
                if (obj === buildings.BlackholeStellarEngine && buildings.BlackholeMassEjector.count > 0 && game.global.interstellar.stellar_engine.exotic < 0.025) {
                    let massPerSec = (resources.Elerium.atomicMass * game.global.interstellar.mass_ejector.Elerium + resources.Infernite.atomicMass * game.global.interstellar.mass_ejector.Infernite) || -1;
                    let missingExotics = (0.025 - game.global.interstellar.stellar_engine.exotic) * 1e10;
                    node.innerHTML += `<div id="popTimer" class="flair has-text-advanced">Contaminated in [${poly.timeFormat(missingExotics / massPerSec)}]</div>`;
                }

                let description = getTooltipInfo(obj);
                if (description) {
                    node.innerHTML += `<div style="border-top: solid .0625rem #999">${description}</div>`;
                }
            }
        }));
    }

    function automate() {
        if (state.goal === "GameOverMan") { return; }

        // Game doesn't expose anything during custom creation, let's check it separately
        let createCustom = document.querySelector("#celestialLab .create button");
        if (createCustom && settings.prestigeType === "ascension" && settings.prestigeAscensionSkipCustom && settings.masterScriptToggle) {
            state.goal = "GameOverMan";
            createCustom.click();
            return;
        }

        // Exposed global it's a deepcopy of real game state, and it's not guaranteed to be actual
        // So, to ensure we won't process same state of game twice - we're storing global, and will wait for *new* one
        // Game ticks faster than script, so normally it's not an issue. But maybe game will be on pause, or debug mode was disabled, or lag badly - better be sure
        if (game.global === state.game) { return; }
        state.game = game.global;

        // console.log("Loop: " + state.scriptTick + ", goal: " + state.goal);
        if (state.scriptTick < Number.MAX_SAFE_INTEGER) {
            state.scriptTick++;
        } else {
            state.scriptTick = 1;
        }

        updateState();
        updateUI();

        // The user has turned off the master toggle. Stop taking any actions on behalf of the player.
        // We've still updated the UI etc. above; just not performing any actions.
        if (!settings.masterScriptToggle) { return; }

        if (state.goal === "Evolution") {
            if (settings.autoEvolution) {
                autoEvolution();
            }
            return;
        }

        if (settings.buildingAlwaysClick || settings.autoBuild){
            autoGatherResources();
        }
        if (settings.autoMarket) {
            autoMarket(); // Invalidates values of resources, changes are random and can't be predicted, but we won't need values anywhere else
        }
        if (settings.autoResearch) {
            autoResearch(); // Called before autoBuild and autoAssembleGene - knowledge goes to techs first
        }
        if (settings.autoHell) {
            autoHell();
        }
        if (settings.autoGalaxyMarket) {
            autoGalaxyMarket();
        }
        if (settings.autoFactory) {
            autoFactory();
        }
        if (settings.autoMiningDroid) {
            autoMiningDroid();
        }
        if (settings.autoGraphenePlant) {
            autoGraphenePlant();
        }
        if (settings.autoPylon) {
            autoPylon();
        }
        if (settings.autoQuarry) {
            autoQuarry();
        }
        if (settings.autoSmelter) {
            autoSmelter();
        }
        if (settings.autoStorage) {
            autoStorage(); // Called before autoJobs, autoFleet and autoPower - so they wont mess with quantum
        }
        if (settings.autoBuild || settings.autoARPA) {
            autoBuild(); // Called after autoStorage to compensate fluctuations of quantum(caused by previous tick's adjustments) levels before weightings
        }
        if (settings.autoJobs) {
            autoJobs();
        }
        if (settings.autoFleet) {
            autoFleet(); // Need to know Mine Layers stateOnCount, called before autoPower while it's still valid
        }
        if (settings.autoMech) {
            autoMech(); // Called after autoBuild, to prevent stealing supplies from mechs
        }
        if (settings.autoAssembleGene) {
            autoAssembleGene(); // Called after autoBuild and autoResearches to prevent stealing knowledge from them
        }
        if (settings.autoMinorTrait) {
            autoMinorTrait(); // Called after auto assemble to utilize new genes right asap
        }
        if (settings.autoCraft) {
            autoCraft(); // Invalidates quantities of craftables, missing exposed craftingRatio to calculate craft result on script side
        }
        if (settings.autoFight) {
            autoFight();
        }
        if (settings.autoTax) {
            autoTax();
        }
        if (settings.govManage) {
            manageGovernment();
        }
        if (settings.autoSupply) {
            autoSupply(); // Purge remaining rateOfChange, should be called when it won't be needed anymore
        }
        if (settings.prestigeWhiteholeEjectEnabled) {
            autoMassEjector(); // Purge remaining rateOfChange, should be called after autoSupply
        }
        if (settings.autoPower) { // Called after purging of rateOfChange, to know useless resources
            autoPower();
        }
        if (settings.prestigeType !== "none") {
            autoPrestige(); // Called after autoBattle to not launch attacks right before reset, killing soldiers
        }

        state.soulGemLast = resources.Soul_Gem.currentQuantity;
    }

    function mainAutoEvolveScript() {
        // This is a hack to check that the entire page has actually loaded. The queueColumn is one of the last bits of the DOM
        // so if it is there then we are good to go. Otherwise, wait a little longer for the page to load.
        if (document.getElementById("queueColumn") === null) {
            setTimeout(mainAutoEvolveScript, 100);
            return;
        }

        // We'll need real window to access vue objects
        if (typeof unsafeWindow !== 'undefined') {
            win = unsafeWindow;
        } else {
            win = window;
        }
        game = win.evolve;

        // Check if game exposing anything
        if (!game) {
            if (state.warnDebug) {
                state.warnDebug = false;
                alert("You need to enable Debug Mode in settings for script to work");
            }
            setTimeout(mainAutoEvolveScript, 100);
            return;
        }

        // Wait until exposed data fully initialized ('p' in fastLoop, 'c' in midLoop)
        if (!game.global?.race || !game.breakdown.p.consume) {
            setTimeout(mainAutoEvolveScript, 100);
            return;
        }

        // Now we can check setting. Ensure game tabs are preloaded
        if (!game.global.settings.tabLoad) {
            if (state.warnPreload) {
                state.warnPreload = false;
                alert("You need to enable Preload Tab Content in settings for script to work");
            }
            setTimeout(mainAutoEvolveScript, 100);
            return;
        }

        // Make sure we have jQuery UI even if script was injected without *monkey
        if (!jQuery.ui) {
            let el = document.createElement("script");
            el.src = "https://code.jquery.com/ui/1.12.1/jquery-ui.min.js";
            el.onload = mainAutoEvolveScript;
            el.onerror = () => alert("Can't load jQuery UI. Check browser console for details.");
            document.body.appendChild(el);
            return;
        }

        // Wrappers for firefox, with code to bypass script sandbox. If we're not on firefox - don't use it, call real functions instead
        if (typeof unsafeWindow !== "object" || typeof cloneInto !== "function") {
            poly.adjustCosts = game.adjustCosts;
            poly.loc = game.loc;
        }

        addScriptStyle();
        initialiseState();
        initialiseRaces();
        initialiseScript();
        setInterval(automate, 1000);
    }

    function addScriptStyle() {
        let styles = `
            .script-lastcolumn:after { float: right; content: "\\21c5"; }
            .script-draggable { cursor: move; cursor: grab; }
            .script-draggable:active { cursor: grabbing !important; }
            .ui-sortable-helper { display: table; cursor: grabbing !important; }

            .script-collapsible {
                background-color: #444;
                color: white;
                cursor: pointer;
                padding: 18px;
                width: 100%;
                border: none;
                text-align: left;
                outline: none;
                font-size: 15px;
            }

            .script-contentactive, .script-collapsible:hover {
                background-color: #333;
            }

            .script-collapsible:after {
                content: '\\002B';
                color: white;
                font-weight: bold;
                float: right;
                margin-left: 5px;
            }

            .script-contentactive:after {
                content: "\\2212";
            }

            .script-content {
                padding: 0 18px;
                display: none;
                //max-height: 0;
                overflow: hidden;
                //transition: max-height 0.2s ease-out;
                //background-color: #f1f1f1;
            }

            .script-searchsettings {
                width: 100%;
                margin-top: 20px;
                margin-bottom: 10px;
            }

            /* Open script options button */
            .s-options-button {
                padding-right: 2px;
                cursor: pointer;
            }

            /* The Modal (background) */
            .script-modal {
              display: none; /* Hidden by default */
              position: fixed; /* Stay in place */
              z-index: 100; /* Sit on top */
              left: 0;
              top: 0;
              width: 100%; /* Full width */
              height: 100%; /* Full height */
              background-color: rgb(0,0,0); /* Fallback color */
              background-color: rgba(10,10,10,.86); /* Blackish w/ opacity */
              overflow-y: auto; /* Allow scrollbar */
            }

            /* Modal Content/Box */
            .script-modal-content {
                position: relative;
                background-color: #1f2424;
                margin: auto;
                margin-top: 50px;
                margin-bottom: 50px;
                //margin-left: 10%;
                //margin-right: 10%;
                padding: 0px;
                //width: 80%;
                width: 900px;
                //max-height: 90%;
                border-radius: .5rem;
                text-align: center;
            }

            /* The Close Button */
            .script-modal-close {
              float: right;
              font-size: 28px;
              margin-top: 20px;
              margin-right: 20px;
            }

            .script-modal-close:hover,
            .script-modal-close:focus {
              cursor: pointer;
            }

            /* Modal Header */
            .script-modal-header {
              padding: 4px 16px;
              margin-bottom: .5rem;
              border-bottom: #ccc solid .0625rem;
              text-align: center;
            }

            /* Modal Body */
            .script-modal-body {
                padding: 2px 16px;
                text-align: center;
                overflow: auto;
            }

            /* Autocomplete styles */
            .ui-autocomplete {
                background-color: #000;
                position: absolute;
                top: 0;
                left: 0;
                cursor: default;
            }
            .ui-helper-hidden-accessible {
                border: 0;
                clip: rect(0 0 0 0);
                height: 1px;
                margin: -1px;
                overflow: hidden;
                padding: 0;
                position: absolute;
                width: 1px;
            }

            .selectable span {
                -moz-user-select: text !important;
                -khtml-user-select: text !important;
                -webkit-user-select: text !important;
                -ms-user-select: text !important;
                user-select: text !important;
            }

            /* Fixes for game styles */
            .main .resources .resource :first-child { white-space: nowrap; }
            #popTimer { margin-bottom: 0.1rem }
            #powerStatus { white-space: nowrap; } // TODO: Remove in 1.2
            .barracks { white-space: nowrap; }
            .area { width: calc(100% / 6) !important; max-width: 8rem; }
            .offer-item { width: 15% !important; max-width: 7.5rem; }
            .tradeTotal { margin-left: 11.5rem !important; }
        `

        // Create style document
        var css = document.createElement('style');
        css.type = 'text/css';
        css.appendChild(document.createTextNode(styles));

        // Append style to html head
        document.getElementsByTagName("head")[0].appendChild(css);
    }

    function removeScriptSettings() {
        $("#script_settings").remove();
    }

    function buildScriptSettings() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let scriptContentNode = $('#script_settings');
        if (scriptContentNode.length !== 0) {
            return;
        }

        scriptContentNode = $('<div id="script_settings" style="margin-top: 30px;"></div>');
        $(".settings").append(scriptContentNode);

        buildImportExport();
        buildPrestigeSettings(scriptContentNode, "");
        buildGeneralSettings();
        buildGovernmentSettings(scriptContentNode, "");
        buildEvolutionSettings();
        buildPlanetSettings();
        buildMinorTraitSettings();
        buildTriggerSettings();
        buildResearchSettings();
        buildWarSettings(scriptContentNode, "");
        buildHellSettings(scriptContentNode, "");
        buildMechSettings();
        buildFleetSettings();
        buildEjectorSettings();
        buildMarketSettings();
        buildStorageSettings();
        buildProductionSettings();
        buildJobSettings();
        buildBuildingSettings();
        buildWeightingSettings();
        buildProjectSettings();
        buildLoggingSettings(scriptContentNode, "");

        let collapsibles = document.getElementsByClassName("script-collapsible");
        for (let i = 0; i < collapsibles.length; i++) {
            collapsibles[i].addEventListener("click", function() {
                this.classList.toggle("script-contentactive");
                let content = this.nextElementSibling;
                if (content.style.display === "block") {
                    settings[collapsibles[i].id] = true;
                    content.style.display = "none";

                    let search = content.getElementsByClassName("script-searchsettings");
                    if (search.length > 0) {
                        search[0].value = "";
                        filterBuildingSettingsTable();
                    }
                } else {
                    settings[collapsibles[i].id] = false;
                    content.style.display = "block";
                    content.style.height = null;
                    content.style.height = content.offsetHeight + "px";
                }

                updateSettingsFromState();
            });
        }

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildImportExport() {
        let importExportNode = $(".importExport").last();
        if (importExportNode === null) {
            return;
        }

        if (document.getElementById("script_settingsImport") !== null) {
            return;
        }

        importExportNode.append(' <button id="script_settingsImport" class="button">Import Script Settings</button>');

        $('#script_settingsImport').on("click", function() {
            if ($('#importExport').val().length > 0) {
                //let saveState = JSON.parse(LZString.decompressFromBase64($('#importExport').val()));
                let saveState = JSON.parse($('#importExport').val());
                if (saveState && typeof saveState === "object" && (saveState.scriptName === "TMVictor" || $.isEmptyObject(saveState))) {
                    console.log("Importing script settings");
                    settings = saveState;
                    resetTriggerState();
                    resetJobState();
                    resetMarketState();
                    resetStorageState();
                    resetProjectState();
                    resetProductionState();
                    resetBuildingState();
                    resetMinorTraitState();
                    updateStateFromSettings();
                    updateSettingsFromState();
                    removeScriptSettings();
                    stopMechObserver();
                    removeStorageToggles();
                    removeMarketToggles();
                    removeArpaToggles();
                    removeCraftToggles();
                    removeBuildingToggles();
                    removeEjectToggles();
                    removeSupplyToggles();
                    $('#autoScriptContainer').remove();
                    updateUI();
                    $('#importExport').val("");
                }
            }
        });

        importExportNode.append(' <button id="script_settingsExport" class="button">Export Script Settings</button>');

        $('#script_settingsExport').on("click", function() {
            //$('#importExport').val(LZString.compressToBase64(JSON.stringify(global)));
            console.log("Exporting script settings");
            $('#importExport').val(JSON.stringify(settings));
            $('#importExport').select();
            document.execCommand('copy');
        });
    }

    function buildSettingsSection(sectionId, sectionName, resetFunction, updateSettingsContentFunction) {
        $("#script_settings").append(`
          <div id="script_${sectionId}Settings" style="margin-top: 10px;">
            <h3 id="${sectionId}SettingsCollapsed" class="script-collapsible text-center has-text-success">${sectionName} Settings</h3>
            <div class="script-content">
              <div style="margin-top: 10px;"><button id="script_reset${sectionId}" class="button">Reset ${sectionName} Settings</button></div>
              <div style="margin-top: 10px; margin-bottom: 10px;" id="script_${sectionId}Content"></div>
            </div>
          </div>`);

        updateSettingsContentFunction();

        if (!settings[sectionId + "SettingsCollapsed"]) {
            let element = document.getElementById(sectionId + "SettingsCollapsed");
            element.classList.toggle("script-contentactive");
            element.nextElementSibling.style.display = "block";
        }

        $("#script_reset" + sectionId).on("click", genericResetFunction.bind(null, resetFunction, sectionName));
    }

    function buildSettingsSection2(parentNode, secondaryPrefix, sectionId, sectionName, resetFunction, updateSettingsContentFunction) {
        if (secondaryPrefix !== "") {
            parentNode.append(`<div style="margin-top: 10px; margin-bottom: 10px;" id="script_${secondaryPrefix + sectionId}Content"></div>`);
        } else {
            parentNode.append(`
              <div id="script_${sectionId}Settings" style="margin-top: 10px;">
                <h3 id="${sectionId}SettingsCollapsed" class="script-collapsible text-center has-text-success">${sectionName} Settings</h3>
                <div class="script-content">
                  <div style="margin-top: 10px;"><button id="script_reset${sectionId}" class="button">Reset ${sectionName} Settings</button></div>
                  <div style="margin-top: 10px; margin-bottom: 10px;" id="script_${sectionId}Content"></div>
                </div>
              </div>`);

            if (!settings[sectionId + "SettingsCollapsed"]) {
                let element = document.getElementById(sectionId + "SettingsCollapsed");
                element.classList.toggle("script-contentactive");
                element.nextElementSibling.style.display = "block";
            }

            $("#script_reset" + sectionId).on("click", genericResetFunction.bind(null, resetFunction, sectionName));
        }

        updateSettingsContentFunction(secondaryPrefix);
    }

    function genericResetFunction(resetFunction, sectionName) {
        if (confirm("Are you sure you wish to reset " + sectionName + " Settings?")) {
            resetFunction();
        }
    }

    function addStandardHeading(node, heading) {
        node.append('<div style="margin-top: 5px; width: 600px;"><span class="has-text-danger" style="margin-left: 10px;">' + heading + '</span></div>');
    }

    function addSettingsHeader1(node, headerText) {
        node.append(`<div style="margin: 4px; width: 100%; display: inline-block; text-align: left;"><span class="has-text-success" style="font-weight: bold;">${headerText}</span></div>`);
    }

    function addSettingsHeader2(node, headerText) {
        node.append(`<div style="margin: 2px; width: 90%; display: inline-block; text-align: left;"><span class="has-text-caution">${headerText}</span></div>`);
    }

    function addSettingsToggle(node, settingName, labelText, hintText) {
        $(`<div style="margin-top: 5px; width: 90%; display: inline-block; text-align: left;">
             <label title="${hintText}" tabindex="0" class="switch">
               <input class="script_${settingName}" type="checkbox" ${settings[settingName] ? " checked" : ""}><span class="check"></span>
               <span style="margin-left: 10px;">${labelText}</span>
             </label>
           </div>`)
        .on('change', 'input', function(event) {
            settings[settingName] = event.currentTarget.checked;
            updateSettingsFromState();

            $(".script_" + settingName).prop('checked', settings[settingName]);
        })
        .appendTo(node);
    }

    function addSettingsNumber(node, settingName, labelText, hintText) {
        $(`<div style="margin-top: 5px; display: inline-block; width: 90%; text-align: left;">
             <label title="${hintText}" tabindex="0">
               <span>${labelText}</span>
               <input class="script_${settingName}" type="text" style="text-align: right; height: 18px; width: 150px; float: right;" value="${settings[settingName]}"></input>
             </label>
           </div>`)
        .on('change', 'input', function() {
            let parsedValue = getRealNumber(this.value);
            if (!isNaN(parsedValue)) {
                settings[settingName] = parsedValue;
                updateSettingsFromState();
            }
            $(".script_" + settingName).val(settings[settingName]);
        })
        .appendTo(node);
    }

    function addSettingsSelect(node, settingName, labelText, hintText, optionsList) {
        let options = optionsList.map(item => `<option value="${item.val}" title="${item.hint}" ${item.val === settings[settingName] ? "selected" : ""}>${item.label}</option>`).join();
        return $(`
           <div style="margin-top: 5px; display: inline-block; width: 90%; text-align: left;">
             <label title="${hintText}" tabindex="0">
               <span>${labelText}</span>
               <select class="script_${settingName}" style="width: 150px; float: right;">
                 ${options}
               </select>
             </label>
           </div>`)
        .on('change', 'select', function() {
            settings[settingName] = this.value;
            updateSettingsFromState();

            $(".script_" + settingName).val(settings[settingName]);
        })
        .appendTo(node);
    }

    function addSettingsList(node, settingName, labelText, hintText, list) {
        let listBlock = $(`
          <div style="display: inline-block; width: 90%; margin-top: 6px;">
            <label title="${hintText}" tabindex="0">
              <span>${labelText}</span>
              <input type="text" style="height: 25px; width: 150px; float: right;" placeholder="Research...">
              <button class="button" style="height: 25px; float: right; margin-right: 4px; margin-left: 4px;">Remove</button>
              <button class="button" style="height: 25px; float: right;">Add</button>
            </label>
            <br>
            <textarea class="script_${settingName} textarea" style="margin-top: 12px" readonly></textarea>
          </div>`)
        .appendTo(node);

        let selectedItem = "";

        let updateList = function() {
            let techsString = settings[settingName].map(id => Object.values(list).find(obj => obj._vueBinding === id).name).join(', ');
            $(".script_" + settingName).val(techsString);
        }

        let onChange = function(event, ui) {
            event.preventDefault();

            // If it wasn't selected from list
            if(ui.item === null){
                let typedName = Object.values(list).find(obj => obj.name === this.value);
                if (typedName !== undefined){
                    ui.item = {label: this.value, value: typedName._vueBinding};
                }
            }

            // We have an item to switch
            if (ui.item !== null && list.hasOwnProperty(ui.item.value)) {
                this.value = ui.item.label;
                selectedItem = ui.item.value;
            } else {
                this.value = "";
                selectedItem = null;
            }
        };

        listBlock.find('input').autocomplete({
            minLength: 2,
            delay: 0,
            source: function(request, response) {
                let matcher = new RegExp($.ui.autocomplete.escapeRegex(request.term), "i");
                response(Object.values(list)
                  .filter(item => matcher.test(item.name))
                  .map(item => ({label: item.name, value: item._vueBinding})));
            },
            select: onChange, // Dropdown list click
            focus: onChange, // Arrow keys press
            change: onChange // Keyboard type
        });

        listBlock.on('click', 'button:eq(1)', function() {
            if (selectedItem && !settings[settingName].includes(selectedItem)) {
                settings[settingName].push(selectedItem);
                settings[settingName].sort();
                updateSettingsFromState();
                updateList();
            }
        });

        listBlock.on('click', 'button:eq(0)', function() {
            if (selectedItem && settings[settingName].includes(selectedItem)) {
                settings[settingName].splice(settings[settingName].indexOf(selectedItem), 1);
                settings[settingName].sort();
                updateSettingsFromState();
                updateList();
            }
        });

        updateList();
    }

    function buildStandartSettingsInput(object, settingKey, property) {
        let textBox = $('<input type="text" class="input is-small" style="height: 25px; width:100%"/>');
        textBox.val(settings[settingKey]);

        textBox.on('change', function() {
            let parsedValue = getRealNumber(textBox.val());
            if (!isNaN(parsedValue)) {
                object[property] = parsedValue;
                updateSettingsFromState();
            }
            textBox.val(settings[settingKey]);
        });

        return textBox;
    }

    function buildStandartSettingsToggle(entity, property, toggleId, syncToggleId) {
        let checked = entity[property] ? " checked" : "";
        let toggle = $('<label id="' + toggleId + '" tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;"><input type="checkbox"' + checked + '> <span class="check" style="height:5px; max-width:15px"></span><span style="margin-left: 20px;"></span></label>');

        toggle.on('change', {entity: entity, property: property, sync: syncToggleId}, toggleCallback);

        return toggle;
    }

    function toggleCallback(event) {
        event.data.entity[event.data.property] = event.currentTarget.children[0].checked;

        let otherCheckbox = document.querySelector(`#${event.data.sync} input`);
        if (otherCheckbox !== null) {
            otherCheckbox.checked = event.data.entity[event.data.property];
        }
        updateSettingsFromState();
    }

    function buildStandartLabel(note, color = "has-text-info") {
        return $(`<span class="${color}">${note}</span>`);
    }

    function buildGeneralSettings() {
        let sectionId = "general";
        let sectionName = "General";

        let resetFunction = function() {
            resetGeneralSettings();
            updateSettingsFromState();
            updateGeneralSettingsContent();
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateGeneralSettingsContent);
    }

    function updateGeneralSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_generalContent');
        currentNode.empty().off("*");

        addSettingsHeader1(currentNode, "Production");
        addSettingsToggle(currentNode, "triggerRequest", "Prioritize resources for triggers", "Readjust trade routes and production to resources required for active triggers. Missing resources will have 100 priority where applicable(autoMarket, autoGalaxyMarket, autoFactory, autoMiningDroid), or just 'top priority' where not(autoTax, autoCraft, autoCraftsmen, autoQuarry, autoSmelter).");
        addSettingsToggle(currentNode, "queueRequest", "Prioritize resources for queue", "Readjust trade routes and production to resources required for buildings and researches in queue. Missing resources will have 100 priority where applicable(autoMarket, autoGalaxyMarket, autoFactory, autoMiningDroid), or just 'top priority' where not(autoTax, autoCraft, autoCraftsmen, autoQuarry, autoSmelter).");
        addSettingsToggle(currentNode, "researchRequest", "Prioritize resources for Pre-MAD researches", "Readjust trade routes and production to resources required for unlocked and affordable researches. Works only with no active triggers, or queue. Missing resources will have 100 priority where applicable(autoMarket, autoGalaxyMarket, autoFactory, autoMiningDroid), or just 'top priority' where not(autoTax, autoCraft, autoCraftsmen, autoQuarry, autoSmelter).");
        addSettingsToggle(currentNode, "researchRequestSpace", "Prioritize resources for Space+ researches", "Readjust trade routes and production to resources required for unlocked and affordable researches. Works only with no active triggers, or queue. Missing resources will have 100 priority where applicable(autoMarket, autoGalaxyMarket, autoFactory, autoMiningDroid), or just 'top priority' where not(autoTax, autoCraft, autoCraftsmen, autoQuarry, autoSmelter).");
        addSettingsToggle(currentNode, "missionRequest", "Prioritize resources for missions", "Readjust trade routes and production to resources required for unlocked and affordable missions. Missing resources will have 100 priority where applicable(autoMarket, autoGalaxyMarket, autoFactory, autoMiningDroid), or just 'top priority' where not(autoTax, autoCraft, autoCraftsmen, autoQuarry, autoSmelter).");

        addSettingsHeader1(currentNode, "Queue");
        addSettingsToggle(currentNode, "buildingsConflictQueue", "Save resources for queued buildings", "Script won't use resources needed for queued buildings. 'No Queue Order' game setting switches whether it save resources for next item, or whole queue.");
        addSettingsToggle(currentNode, "buildingsConflictRQueue", "Save resources for queued researches", "Script won't use resources needed for queued researches. 'No Queue Order' game setting switches whether it save resources for next item, or whole queue.");
        addSettingsToggle(currentNode, "buildingsConflictPQueue", "Save resources for queued projects", "Script won't use resources needed for queued projects. 'No Queue Order' game setting switches whether it save resources for next item, or whole queue.");

        addSettingsHeader1(currentNode, "Auto clicker");
        addSettingsToggle(currentNode, "genesAssembleGeneAlways", "Always assemble genes", "Will continue assembling genes even after De Novo Sequencing is researched");
        addSettingsToggle(currentNode, "buildingAlwaysClick", "Always autoclick resources", "By default script will click only during early stage of autoBuild, to bootstrap production. With this toggled on it will continue clicking forever");
        addSettingsNumber(currentNode, "buildingClickPerTick", "Maximum clicks per second", "Number of clicks performed at once, each second. Hardcapped by amount of missed resources");

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildPrestigeSettings(parentNode, secondaryPrefix) {
        let sectionId = "prestige";
        let sectionName = "Prestige";

        let resetFunction = function() {
            resetPrestigeSettings();
            updateSettingsFromState();
            updatePrestigeSettingsContent(secondaryPrefix);
        };

        buildSettingsSection2(parentNode, secondaryPrefix, sectionId, sectionName, resetFunction, updatePrestigeSettingsContent);
    }

    const prestigeOptions = `
      <option value = "none" title = "Endless game">None</option>
      <option value = "mad" title = "MAD prestige once MAD has been researched and all soldiers are home">Mutual Assured Destruction</option>
      <option value = "bioseed" title = "Launches the bioseeder ship to perform prestige when required probes have been constructed">Bioseed</option>
      <option value = "cataclysm" title = "Perform cataclysm reset by researching Dial It To 11 once available">Cataclysm</option>
      <option value = "whitehole" title = "Infuses the blackhole with exotic materials to perform prestige">Whitehole</option>
      <option value = "vacuum" title = "Build Mana Syphons until the end">Vacuum Collapse</option>
      <option value = "ascension" title = "Allows research of Incorporeal Existence and Ascension. Ascension Machine managed by autoPower. User input still required to trigger reset, and create custom race.">Ascension</option>
      <option value = "demonic" title = "Sacrifice your entire civilization to absorb the essence of a greater demon lord">Demonic Infusion</option>`;

    function updatePrestigeSettingsContent(secondaryPrefix) {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $(`#script_${secondaryPrefix}prestigeContent`);
        currentNode.empty().off("*");

        currentNode.append(`
          <div style="display: inline-block; width: 90%; text-align: left; margin-bottom: 10px;">
            <label>
              <span>Prestige Type</span>
              <select class="script_prestigeType" style="text-align: right; height: 18px; width: 150px; float: right;">
                ${prestigeOptions}
              </select>
            </label>
          </div>`);

        currentNode.find('.script_prestigeType')
          .val(settings.prestigeType)
          .on('change', function() {
            // Special processing for prestige options. If they are ready to prestige then warn the user about enabling them.
            let confirmationText = "";
            if (this.value === "mad" && haveTech("mad")) {
                confirmationText = "MAD has already been researched. You may prestige immediately. Are you sure you want to toggle this prestige?";
            } else if (this.value === "bioseed" && isBioseederPrestigeAvailable()) {
                confirmationText = "Required probes are built, and bioseeder ship is ready to launch. You may prestige immediately. Are you sure you want to toggle this prestige?";
            } else if (this.value === "cataclysm" && isCataclysmPrestigeAvailable()) {
                confirmationText = "Dial It To 11 is unlocked. You may prestige immediately. Are you sure you want to toggle this prestige?";
            } else if (this.value === "whitehole" && isWhiteholePrestigeAvailable()) {
                confirmationText = "Required mass is reached, and exotic infusion is unlocked. You may prestige immediately. Are you sure you want to toggle this prestige?";
            } else if (this.value === "ascension" && isAscensionPrestigeAvailable()) {
                confirmationText = "Ascension machine is built and powered. Custom race won't be changed. You may prestige immediately. Are you sure you want to toggle this prestige?";
            } else if (this.value === "demonic" && isDemonicPrestigeAvailable()) {
                confirmationText = "Required floor is reached, and demon lord is already dead. You may prestige immediately. Are you sure you want to toggle this prestige?";
            }
            if (confirmationText !== "" && !confirm(confirmationText)) {
                this.value = "none";
            }
            settings.prestigeType = this.value;
            $(".script_prestigeType").val(settings.prestigeType);

            state.goal = "Standard";
            updateSettingsFromState();
        });

        addSettingsToggle(currentNode, "buildPopulation", "Build only population buildings");
        addSettingsToggle(currentNode, "prestigeWaitAT", "Use all Accelerated Time", "Delay reset until all accelerated time will be used");
        addSettingsToggle(currentNode, "prestigeBioseedConstruct", "Ignore useless buildings", "Space Dock, Bioseeder Ship and Probes will be constructed only when Bioseed prestige enabled. World Collider won't be constructed during Bioseed. Jump Ship won't be constructed during Whitehole. Stellar Engine won't be constucted during Vacuum Collapse.");
        addSettingsNumber(currentNode, "prestigeEnabledBarracks", "Percent of active barracks after unification", "Percent of barracks to keep enabled after unification, disabling some of them can reduce stress. All barracks will be enabled back when Bioseeder Ship will be at 90%, or after building World Collider");

        // MAD
        addSettingsHeader1(currentNode, "Mutual Assured Destruction");
        addSettingsToggle(currentNode, "prestigeMADIgnoreArpa", "Pre-MAD: Ignore A.R.P.A.", "Disables building A.R.P.A. projects until MAD is researched");
        addSettingsToggle(currentNode, "prestigeMADWait", "Wait for maximum population", "Wait for maximum population and soldiers to maximize plasmids gain");
        addSettingsNumber(currentNode, "prestigeMADPopulation", "Required population", "Required number of workers and soldiers before performing MAD reset");

        // Bioseed
        addSettingsHeader1(currentNode, "Bioseed");
        addSettingsNumber(currentNode, "prestigeBioseedProbes", "Required probes", "Required number of probes before launching bioseeder ship");

        // Whitehole
        addSettingsHeader1(currentNode, "Whitehole");
        addSettingsToggle(currentNode, "prestigeWhiteholeSaveGems", "Save up Soul Gems for reset", "Save up enough Soul Gems for reset, only excess gems will be used. This option does not affect triggers.");
        addSettingsNumber(currentNode, "prestigeWhiteholeMinMass", "Minimum solar mass for reset", "Required minimum solar mass of blackhole before prestiging. Script do not stabilize on blackhole run, this number will need to be reached naturally");
        addSettingsToggle(currentNode, "prestigeWhiteholeStabiliseMass", "Stabilize blackhole", "Stabilizes the blackhole with exotic materials, disabled on whitehole runs");
        addSettingsToggle(currentNode, "prestigeWhiteholeEjectEnabled", "Enable mass ejector", "If not enabled the mass ejector will not be managed by the script");
        addSettingsToggle(currentNode, "prestigeWhiteholeEjectExcess", "Eject excess resources", "Eject resources above amount required for buildings, normally only resources with full storages will be ejected, until 'Eject everything' option is activated.");
        addSettingsNumber(currentNode, "prestigeWhiteholeDecayRate", "(Decay Challenge) Eject rate", "Set amount of ejected resources up to this percent of decay rate, only useful during Decay Challenge");
        addSettingsNumber(currentNode, "prestigeWhiteholeEjectAllCount", "Eject everything once X mass ejectors constructed", "Once we've constructed X mass ejectors the eject as much of everything as possible");

        // Ascension
        addSettingsHeader1(currentNode, "Ascension");
        addSettingsToggle(currentNode, "prestigeAscensionSkipCustom", "Skip Custom Race", "Perform reset without making any changes to custom. This option is required, script won't ascend automatically without it enabled.");
        addSettingsToggle(currentNode, "prestigeAscensionPillar", "Wait for Pillar", "Wait for Pillar before ascending, unless it was done earlier");

        // Demonic Infusion
        addSettingsHeader1(currentNode, "Demonic Infusion");
        addSettingsNumber(currentNode, "prestigeDemonicFloor", "Minimum spire floor for reset", "Perform reset after climbing up to this spire floor");
        addSettingsNumber(currentNode, "prestigeDemonicPotential", "Maximum mech potential for reset", "Perform reset only if current mech team potential below given amount. Full bay of best mechs will have `1` potential. This allows to postpone reset if your team is still good after reaching target floor, and can quickly clear another floor");
        addSettingsToggle(currentNode, "prestigeDemonicBomb", "Use Dark Energy Bomb", "Kill Demon Lord with Dark Energy Bomb");

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildGovernmentSettings(parentNode, secondaryPrefix) {
        let sectionId = "government";
        let sectionName = "Government";

        let resetFunction = function() {
            resetGovernmentSettings();
            updateSettingsFromState();
            updateGovernmentSettingsContent(secondaryPrefix);
        };

        buildSettingsSection2(parentNode, secondaryPrefix, sectionId, sectionName, resetFunction, updateGovernmentSettingsContent);
    }

    function updateGovernmentSettingsContent(secondaryPrefix) {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $(`#script_${secondaryPrefix}governmentContent`);
        currentNode.empty().off("*");

        addSettingsNumber(currentNode, "generalMinimumTaxRate", "Minimum allowed tax rate", "Minimum tax rate for autoTax. Will still go below this amount if money storage is full");
        addSettingsNumber(currentNode, "generalMinimumMorale", "Minimum allowed morale", "Use this to set a minimum allowed morale. Remember that less than 100% can cause riots and weather can cause sudden swings");
        addSettingsNumber(currentNode, "generalMaximumMorale", "Maximum allowed morale", "Use this to set a maximum allowed morale. The tax rate will be raised to lower morale to this maximum");

        addSettingsToggle(currentNode, "govManage", "Manage changes of government", "Manage changes of government when they become available");

        let governmentOptions = Object.keys(GovernmentManager.Types).filter(id => id !== "anarchy").map(id => ({val: id, label: game.loc(`govern_${id}`), hint: game.loc(`govern_${id}_desc`)}));
        addSettingsSelect(currentNode, "govInterim", "Interim Government", "Temporary low tier government until you research other governments", governmentOptions);
        addSettingsSelect(currentNode, "govFinal", "Second Government", "Second government choice, chosen once becomes available. Can be the same as above", governmentOptions);
        addSettingsSelect(currentNode, "govSpace", "Space Government", "Government for bioseed+. Chosen once you researched Quantum Manufacturing. Can be the same as above", governmentOptions);

        let governorsOptions = [{val: "none", label: "None", hint: ""}, ...governors.map(id => ({val: id, label: game.loc(`governor_${id}`), hint: game.loc(`governor_${id}_desc`)}))];
        addSettingsSelect(currentNode, "govGovernor", "Governor", "Chosen governor will be appointed.", governorsOptions);

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildEvolutionSettings() {
        let sectionId = "evolution";
        let sectionName = "Evolution";

        let resetFunction = function() {
            resetEvolutionSettings();
            updateSettingsFromState();
            updateEvolutionSettingsContent();
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateEvolutionSettingsContent);
    }

    function updateRaceWarning() {
        let race = races[settings.userEvolutionTarget];
        if (race && race.getCondition() !== '') {
            let suited = race.getHabitability();
            if (suited === 1) {
                $("#script_race_warning").html(`<span class="has-text-success">This race have special requirements: ${race.getCondition()}. This condition is met.</span>`);
            } else if (suited === 0) {
                $("#script_race_warning").html(`<span class="has-text-danger">Warning! This race have special requirements: ${race.getCondition()}. This condition is not met.</span>`);
            } else {
                $("#script_race_warning").html(`<span class="has-text-warning">Warning! This race have special requirements: ${race.getCondition()}. This condition is bypassed. Race will have ${100 - suited * 100}% penalty.</span>`);
            }
        } else {
            $("#script_race_warning").empty();
        }
    }

    function updateEvolutionSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_evolutionContent');
        currentNode.empty().off("*");

        // Target universe
        let universeOptions = [{val: "none", label: "None", hint: "Wait for user selection"},
                               ...universes.map(id => ({val: id, label: game.loc(`universe_${id}`), hint: game.loc(`universe_${id}_desc`)}))];
        addSettingsSelect(currentNode, "userUniverseTargetName", "Target Universe", "Chosen universe will be automatically selected after appropriate reset", universeOptions);

        // Target planet
        let planetOptions = [{val: "none", label: "None", hint: "Wait for user selection"},
                             {val: "habitable", label: "Most habitable", hint: "Picks most habitable planet, based on biome and trait"},
                             {val: "achieve", label: "Most achievements", hint: "Picks planet with most unearned achievements. Takes in account extinction achievements for planet exclusive races, and greatness achievements for planet biome, trait, and exclusive genus."},
                             {val: "weighting", label: "Highest weighting", hint: "Picks planet with highest weighting. Should be configured in Planet Weighting Settings section."}];
        addSettingsSelect(currentNode, "userPlanetTargetName", "Target Planet", "Chosen planet will be automatically selected after appropriate reset", planetOptions);

        // Target evolution
        let raceOptions = [{val: "auto", label: "Auto Achievements", hint: "Picks race with not infused pillar for Ascension, with unearned Greatness achievement for Bioseed, or with unearned Extinction achievement in other cases. Conditional races are prioritized, when available."},
                           ...Object.values(races).map(race => ({val: race.id, label: race.name, hint: race.desc}))];
        addSettingsSelect(currentNode, "userEvolutionTarget", "Target Race", "Chosen race will be automatically selected during next evolution", raceOptions)
          .on('change', 'select', function() {
            state.evolutionTarget = null;
            updateRaceWarning();

            let content = document.querySelector('#script_evolutionSettings .script-content');
            content.style.height = null;
            content.style.height = content.offsetHeight + "px"
        });

        currentNode.append(`<div><span id="script_race_warning"></span></div>`);
        updateRaceWarning();

        addSettingsToggle(currentNode, "evolutionBackup", "Soft Reset", "Perform soft resets until you'll get chosen race. Useless after getting mass exintion perk.");

        // Challenges
        for (let i = 0; i < challenges.length; i++) {
            let set = challenges[i];
            addSettingsToggle(currentNode, `challenge_${set[0].id}`,
              set.map(c => game.loc(`evo_challenge_${c.id}`)).join(" | "),
              set.map(c => game.loc(`evo_challenge_${c.id}_effect`)).join("&#xA;"));
        }

        addStandardHeading(currentNode, "Evolution Queue");
        addSettingsToggle(currentNode, "evolutionQueueEnabled", "Queue Enabled", "When enabled script with evolve with queued settings, from top to bottom. During that script settings will be overriden with settings stored in queue. Queued target will be removed from list after evolution.");
        addSettingsToggle(currentNode, "evolutionQueueRepeat", "Repeat Queue", "When enabled applied evolution targets will be moved to the end of queue, instead of being removed");


        currentNode.append(`
          <div style="margin-top: 5px; display: inline-block; width: 90%; text-align: left;">
            <label for="script_evolution_prestige">Prestige for new evolutions:</label>
            <select id="script_evolution_prestige" style="text-align: right; height: 18px; width: 150px; float: right;">
              <option value = "auto" title = "Inherited from current Prestige Settings">Current Prestige</option>
              ${prestigeOptions}
            </select>
          </div>
          <div style="margin-top: 10px;">
            <button id="script_evlution_add" class="button">Add New Evolution</button>
          </div>`);

        $("#script_evlution_add").on("click", addEvolutionSetting);
        currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:25%">Race</th>
              <th class="has-text-warning" style="width:70%">Settings</th>
              <th style="width:5%"></th>
            </tr>
            <tbody id="script_evolutionQueueTable"></tbody>
          </table>`);

        let tableBodyNode = $('#script_evolutionQueueTable');
        for (let i = 0; i < settings.evolutionQueue.length; i++) {
            tableBodyNode.append(buildEvolutionQueueItem(i));
        }

        $('#script_evolutionQueueTable').sortable( {
            items: "tr:not(.unsortable)",
            helper: function(event, ui){
                let clone = $(ui).clone();
                clone.css('position','absolute');
                return clone.get(0);
            },
            update: function() {
                let evolutionIds = $('#script_evolutionQueueTable').sortable('toArray', {attribute: 'value'});

                let sortedQueue = [];
                for (let i = 0; i < evolutionIds.length; i++) {
                    let id = parseInt(evolutionIds[i]);
                    sortedQueue.push(settings.evolutionQueue[id]);
                }
                settings.evolutionQueue = sortedQueue;
                updateSettingsFromState();
                updateEvolutionSettingsContent();
            },
        } );

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildEvolutionQueueItem(id) {
        let queuedEvolution = settings.evolutionQueue[id];

        let raceName = "";
        let raceClass = "";
        let prestigeName = "";
        let prestigeClass = "";

        let race = races[queuedEvolution.userEvolutionTarget];
        if (race) {
            raceName = race.name;

            // Check if we can evolve intro it
            let suited = race.getHabitability();
            if (suited === 1) {
                raceClass = "has-text-info";
            } else if (suited === 0) {
                raceClass = "has-text-danger";
            } else {
                raceClass = "has-text-warning";
            }
        } else if (queuedEvolution.userEvolutionTarget === "auto") {
            raceName = "Auto Achievements";
            raceClass = "has-text-advanced";
        } else {
            raceName = "Unrecognized race!";
            raceClass = "has-text-danger";
        }

        let star = $(`#settings a.dropdown-item:contains("${game.loc(game.global.settings.icon)}") svg`).clone();
        star.removeClass();
        star.addClass("star" + getAchievementLevel(queuedEvolution));

        if (queuedEvolution.prestigeType !== "none") {
            if (prestigeNames[queuedEvolution.prestigeType]) {
                prestigeName = `(${prestigeNames[queuedEvolution.prestigeType]})`;
                prestigeClass = "has-text-info";
            } else {
                prestigeName = "Unrecognized prestige!";
                prestigeClass = "has-text-danger";
            }
        }

        let queueNode = $(`
          <tr id="script_evolution_${id}" value="${id}" class="script-draggable">
            <td style="width:25%"><span class="${raceClass}">${raceName}</span> <span class="${prestigeClass}">${prestigeName}</span> ${star.prop('outerHTML') ?? (getAchievementLevel(queuedEvolution)-1) + "*"}</td>
            <td style="width:70%"><textarea class="textarea">${JSON.stringify(queuedEvolution, null, 4)}</textarea></td>
            <td style="width:5%"><a class="button is-dark is-small"><span>X</span></a></td>
          </tr>`);

        // Delete button
        queueNode.find(".button").on('click', function() {
            settings.evolutionQueue.splice(id, 1);
            updateSettingsFromState();
            updateEvolutionSettingsContent();

            let content = document.querySelector('#script_evolutionSettings .script-content');
            content.style.height = null;
            content.style.height = content.offsetHeight + "px"
        });


        // Settings textarea
        queueNode.find(".textarea").on('change', function() {
            try {
                let queuedEvolution = JSON.parse(this.value);
                settings.evolutionQueue[id] = queuedEvolution;
                updateSettingsFromState();
                updateEvolutionSettingsContent();
            } catch (error) {
                queueNode.find('td:eq(0)').html(`<span class="has-text-danger">${error}</span>`);
            }

            let content = document.querySelector('#script_evolutionSettings .script-content');
            content.style.height = null;
            content.style.height = content.offsetHeight + "px"
        });

        return queueNode;
    }

    function addEvolutionSetting() {
        let queuedEvolution = {};
        for (let i = 0; i < evolutionSettingsToStore.length; i++){
            let settingName = evolutionSettingsToStore[i];
            let settingValue = settings[settingName];
            queuedEvolution[settingName] = settingValue;
        }

        let overridePrestige = $("#script_evolution_prestige").first().val();
        if (overridePrestige && overridePrestige !== "auto") {
            queuedEvolution.prestigeType = overridePrestige;
        }

        let queueLength = settings.evolutionQueue.push(queuedEvolution);
        updateSettingsFromState();

        let tableBodyNode = $('#script_evolutionQueueTable');
        tableBodyNode.append(buildEvolutionQueueItem(queueLength-1));

        let content = document.querySelector('#script_evolutionSettings .script-content');
        content.style.height = null;
        content.style.height = content.offsetHeight + "px"
    }

    function buildPlanetSettings() {
        let sectionId = "planet";
        let sectionName = "Planet Weighting";

        let resetFunction = function() {
            resetPlanetSettings();
            updateSettingsFromState();
            updatePlanetSettingsContent();
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updatePlanetSettingsContent);
    }

    function updatePlanetSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_planetContent');
        currentNode.empty().off("*");

        currentNode.append(`
          <span>Planet Weighting = Biome Weighting + Trait Weighting + (Extras Intensity * Extras Weightings)</span>
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:20%">Biome</th>
              <th class="has-text-warning" style="width:calc(40% / 3)">Weighting</th>
              <th class="has-text-warning" style="width:20%">Trait</th>
              <th class="has-text-warning" style="width:calc(40% / 3)">Weighting</th>
              <th class="has-text-warning" style="width:20%">Extra</th>
              <th class="has-text-warning" style="width:calc(40% / 3)">Weighting</th>
            </tr>
            <tbody id="script_planetTableBody"></tbody>
          </table>`);

        let tableBodyNode = $('#script_planetTableBody');
        let newTableBodyText = "";

        let tableSize = Math.max(biomeList.length, traitList.length, extraList.length);
        for (let i = 0; i < tableSize; i++) {
            newTableBodyText += `<tr><td id="script_planet_${i}" style="width:20%"></td><td style="width:calc(40% / 3);border-right-width:1px"></td><td style="width:20%"></td><td style="width:calc(40% / 3);border-right-width:1px"></td><td style="width:20%"></td><td style="width:calc(40% / 3)"></td>/tr>`;
        }
        tableBodyNode.append($(newTableBodyText));

        for (let i = 0; i < tableSize; i++) {
            let tableElement = $('#script_planet_' + i);

            if (i < biomeList.length) {
                tableElement.append(buildStandartLabel(game.loc("biome_" +  biomeList[i] + "_name")));
                tableElement = tableElement.next();
                tableElement.append(buildStandartSettingsInput(settings, "biome_w_" + biomeList[i], "biome_w_" + biomeList[i]));
            } else {
                tableElement = tableElement.next();
            }
            tableElement = tableElement.next();

            if (i < traitList.length) {
                tableElement.append(buildStandartLabel(i == 0 ? "None" : game.loc("planet_" + traitList[i])));
                tableElement = tableElement.next();
                tableElement.append(buildStandartSettingsInput(settings, "trait_w_" + traitList[i], "trait_w_" + traitList[i]));
            } else {
                tableElement = tableElement.next();
            }
            tableElement = tableElement.next();

            if (i < extraList.length) {
                tableElement.append(buildStandartLabel(extraList[i]));
                tableElement = tableElement.next();
                tableElement.append(buildStandartSettingsInput(settings, "extra_w_" + extraList[i], "extra_w_" + extraList[i]));
            }
        }

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function resetPlanetSettings() {
        biomeList.forEach(biome => settings["biome_w_" + biome] = (planetBiomes.length - planetBiomes.indexOf(biome)) * 10);
        traitList.forEach(trait => settings["trait_w_" + trait] = (planetTraits.length - planetTraits.indexOf(trait)) * 10);
        extraList.forEach(extra => settings["extra_w_" + extra] = 0);
        settings.extra_w_Achievement = 1000;
    }

    function buildTriggerSettings() {
        let sectionId = "trigger";
        let sectionName = "Trigger";

        let resetFunction = function() {
            resetTriggerState();
            updateSettingsFromState();
            updateTriggerSettingsContent();
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateTriggerSettingsContent);
    }

    function updateTriggerSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_triggerContent');
        currentNode.empty().off("*");

        currentNode.append('<div style="margin-top: 10px;"><button id="script_trigger_add" class="button">Add New Trigger</button></div>');
        $("#script_trigger_add").on("click", addTriggerSetting);

        currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" colspan="3">Requirement</th>
              <th class="has-text-warning" colspan="5">Action</th>
            </tr>
            <tr>
              <th class="has-text-warning" style="width:16%">Type</th>
              <th class="has-text-warning" style="width:18%">Id</th>
              <th class="has-text-warning" style="width:11%">Count</th>
              <th class="has-text-warning" style="width:16%">Type</th>
              <th class="has-text-warning" style="width:18%">Id</th>
              <th class="has-text-warning" style="width:11%">Count</th>
              <th style="width:5%"></th>
              <th style="width:5%"></th>
            </tr>
            <tbody id="script_triggerTableBody"></tbody>
          </table>`);

        let tableBodyNode = $('#script_triggerTableBody');
        let newTableBodyText = "";

        for (let i = 0; i < TriggerManager.priorityList.length; i++) {
            const trigger = TriggerManager.priorityList[i];
            newTableBodyText += `<tr id="script_trigger_${trigger.seq}" value="${trigger.seq}" class="script-draggable"><td style="width:16%"></td><td style="width:18%"></td><td style="width:11%"></td><td style="width:16%"></td><td style="width:18%"></td><td style="width:11%"></td><td style="width:5%"></td><td style="width:5%"><span class="script-lastcolumn"></span></td></tr>`;
        }
        tableBodyNode.append($(newTableBodyText));

        for (let i = 0; i < TriggerManager.priorityList.length; i++) {
            const trigger = TriggerManager.priorityList[i];

            buildTriggerRequirementType(trigger);
            buildTriggerRequirementId(trigger);
            buildTriggerRequirementCount(trigger);

            buildTriggerActionType(trigger);
            buildTriggerActionId(trigger);
            buildTriggerActionCount(trigger);

            buildTriggerSettingsColumn(trigger);
        }

        $('#script_triggerTableBody').sortable({
            items: "tr:not(.unsortable)",
            helper: function(event, ui){
                let clone = $(ui).clone();
                clone.css('position','absolute');
                return clone.get(0);
            },
            update: function() {
                let triggerIds = $('#script_triggerTableBody').sortable('toArray', {attribute: 'value'});

                for (let i = 0; i < triggerIds.length; i++) {
                    const seq = parseInt(triggerIds[i]);
                    // Trigger has been dragged... Update all trigger priorities
                    TriggerManager.getTrigger(seq).priority = i;
                }

                TriggerManager.sortByPriority();
                updateSettingsFromState();
            },
        });

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function addTriggerSetting() {
        let trigger = TriggerManager.AddTrigger("unlocked", "tech-club", 0, "research", "tech-club", 0);
        updateSettingsFromState();

        let tableBodyNode = $('#script_triggerTableBody');
        let newTableBodyText = "";

        newTableBodyText += `<tr id="script_trigger_${trigger.seq}" value="${trigger.seq}" class="script-draggable"><td style="width:16%"></td><td style="width:18%"></td><td style="width:11%"></td><td style="width:16%"></td><td style="width:18%"></td><td style="width:11%"></td><td style="width:5%"></td><td style="width:5%"><span class="script-lastcolumn"></span></td></tr>`;

        tableBodyNode.append($(newTableBodyText));

        buildTriggerRequirementType(trigger);
        buildTriggerRequirementId(trigger);
        buildTriggerRequirementCount(trigger);

        buildTriggerActionType(trigger);
        buildTriggerActionId(trigger);
        buildTriggerActionCount(trigger);

        buildTriggerSettingsColumn(trigger);

        let content = document.querySelector('#script_triggerSettings .script-content');
        content.style.height = null;
        content.style.height = content.offsetHeight + "px"
    }

    function buildTriggerRequirementType(trigger) {
        let triggerElement = $('#script_trigger_' + trigger.seq).children().eq(0);
        triggerElement.empty().off("*");

        // Requirement Type
        let typeSelectNode = $(`
          <select>
            <option value = "unlocked" title = "This condition is met when technology is shown in research tab">Unlocked</option>
            <option value = "researched" title = "This condition is met when technology is researched">Researched</option>
            <option value = "built" title = "This condition is met when you have 'count' or greater amount of buildings">Built</option>
          </select>`);
        typeSelectNode.val(trigger.requirementType);

        triggerElement.append(typeSelectNode);

        typeSelectNode.on('change', function() {
            trigger.updateRequirementType(this.value);

            buildTriggerRequirementId(trigger);
            buildTriggerRequirementCount(trigger);

            buildTriggerActionType(trigger);
            buildTriggerActionId(trigger);
            buildTriggerActionCount(trigger);

            updateSettingsFromState();
        });

        return;
    }

    function buildTriggerRequirementId(trigger) {
        let triggerElement = $('#script_trigger_' + trigger.seq).children().eq(1);
        triggerElement.empty().off("*");

        if (trigger.requirementType === "researched" || trigger.requirementType === "unlocked") {
            triggerElement.append(buildTriggerListInput(techIds, trigger, "requirementId"));
        }
        if (trigger.requirementType === "built") {
            triggerElement.append(buildTriggerListInput(buildingIds, trigger, "requirementId"));
        }
    }

    function buildTriggerRequirementCount(trigger) {
        let triggerElement = $('#script_trigger_' + trigger.seq).children().eq(2);
        triggerElement.empty().off("*");

        if (trigger.requirementType === "built") {
            triggerElement.append(buildTriggerCountInput(trigger, "requirementCount"));
        }
    }

    function buildTriggerActionType(trigger) {
        let triggerElement = $('#script_trigger_' + trigger.seq).children().eq(3);
        triggerElement.empty().off("*");

        // Action Type
        let typeSelectNode = $(`
          <select>
            <option value = "research" title = "Research technology">Research</option>
            <option value = "build" title = "Build buildings up to 'count' amount">Build</option>
            <option value = "arpa" title = "Build projects up to 'count' amount">A.R.P.A.</option>
          </select>`);
        typeSelectNode.val(trigger.actionType);

        triggerElement.append(typeSelectNode);

        typeSelectNode.on('change', function() {
            trigger.updateActionType(this.value);

            buildTriggerActionId(trigger);
            buildTriggerActionCount(trigger);

            updateSettingsFromState();
        });

        return;
    }

    function buildTriggerActionId(trigger) {
        let triggerElement = $('#script_trigger_' + trigger.seq).children().eq(4);
        triggerElement.empty().off("*");

        if (trigger.actionType === "research") {
            triggerElement.append(buildTriggerListInput(techIds, trigger, "actionId"));
        }
        if (trigger.actionType === "build") {
            triggerElement.append(buildTriggerListInput(buildingIds, trigger, "actionId"));
        }
        if (trigger.actionType === "arpa") {
            triggerElement.append(buildTriggerListInput(arpaIds, trigger, "actionId"));
        }
    }

    function buildTriggerActionCount(trigger) {
        let triggerElement = $('#script_trigger_' + trigger.seq).children().eq(5);
        triggerElement.empty().off("*");

        if (trigger.actionType === "build" || trigger.actionType === "arpa") {
            triggerElement.append(buildTriggerCountInput(trigger, "actionCount"));
        }
    }

    function buildTriggerSettingsColumn(trigger) {
        let triggerElement = $('#script_trigger_' + trigger.seq).children().eq(6);
        triggerElement.empty().off("*");

        let deleteTriggerButton = $('<a class="button is-dark is-small"><span>X</span></a>');
        triggerElement.append(deleteTriggerButton);
        deleteTriggerButton.on('click', function() {
            TriggerManager.RemoveTrigger(trigger.seq);
            updateSettingsFromState();
            updateTriggerSettingsContent();

            let content = document.querySelector('#script_triggerSettings .script-content');
            content.style.height = null;
            content.style.height = content.offsetHeight + "px"
        });
    }

    function buildTriggerListInput(list, trigger, property){
        let typeSelectNode = $('<input style="width:100%"></input>');

        // Event handler
        let onChange = function(event, ui) {
            event.preventDefault();

            // If it wasn't selected from list
            if(ui.item === null){
                let typedName = Object.values(list).find(obj => obj.name === this.value);
                if (typedName !== undefined){
                    ui.item = {label: this.value, value: typedName._vueBinding};
                }
            }

            // We have an item to switch
            if (ui.item !== null && list.hasOwnProperty(ui.item.value)) {
                if (trigger[property] === ui.item.value) {
                    return;
                }

                trigger[property] = ui.item.value;
                trigger.complete = false;

                updateSettingsFromState();

                this.value = ui.item.label;
                return;
            }

            // No building selected, don't change trigger, just restore old name in text field
            if (list.hasOwnProperty(trigger[property])) {
                this.value = list[trigger[property]].name;
                return;
            }
        };

        typeSelectNode.autocomplete({
            minLength: 2,
            delay: 0,
            source: function(request, response) {
                let matcher = new RegExp($.ui.autocomplete.escapeRegex(request.term), "i");
                response(Object.values(list)
                  .filter(item => matcher.test(item.name))
                  .map(item => ({label: item.name, value: item._vueBinding})));
            },
            select: onChange, // Dropdown list click
            focus: onChange, // Arrow keys press
            change: onChange // Keyboard type
        });

        if (list.hasOwnProperty(trigger[property])) {
            typeSelectNode.val(list[trigger[property]].name);
        }

        return typeSelectNode;
    }

    function buildTriggerCountInput(trigger, property) {
        let textBox = $('<input type="text" class="input is-small" style="width:100%"/>');
        textBox.val(trigger[property]);

        textBox.on('change', function() {
            let parsedValue = getRealNumber(textBox.val());
            if (!isNaN(parsedValue)) {
                trigger[property] = parsedValue;
                trigger.complete = false;

                updateSettingsFromState();
            }
            textBox.val(trigger[property]);
        });

        return textBox;
    }

    function buildResearchSettings() {
        let sectionId = "research";
        let sectionName = "Research";

        let resetFunction = function() {
            resetResearchSettings();
            updateSettingsFromState();
            updateResearchSettingsContent();
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateResearchSettingsContent);
    }

    function updateResearchSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_researchContent');
        currentNode.empty().off("*");

        // Theology 1
        let theology1Options = [{val: "auto", label: "Script Managed", hint: "Picks Anthropology for MAD prestige, and Fanaticism for others. Achieve-worthy combos are exception, on such runs Fanaticism will be always picked."},
                                {val: "tech-anthropology", label: game.loc('tech_anthropology'), hint: game.loc('tech_anthropology_effect')},
                                {val: "tech-fanaticism", label: game.loc('tech_fanaticism'), hint: game.loc('tech_fanaticism_effect')}];
        addSettingsSelect(currentNode, "userResearchTheology_1", "Target Theology 1", "Theology 1 technology to research, have no effect after getting Transcendence perk", theology1Options);

        // Theology 2
        let theology2Options = [{val: "auto", label: "Script Managed", hint: "Picks Deify for Ascension prestige, and Study for others"},
                                {val: "tech-study", label: game.loc('tech_study'), hint: game.loc('tech_study_desc')},
                                {val: "tech-deify", label: game.loc('tech_deify'), hint: game.loc('tech_deify_desc')}];
        addSettingsSelect(currentNode, "userResearchTheology_2", "Target Theology 2", "Theology 2 technology to research", theology2Options);

        addSettingsList(currentNode, "researchIgnore", "Ignored researches", "Listed researches won't be purchased without manual input, or user defined trigger. On top of this list script will also ignore some other special techs, such as Limit Collider, Dark Energy Bomb, Exotic Infusion, etc.", techIds);

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildWarSettings(parentNode, secondaryPrefix) {
        let sectionId = "war";
        let sectionName = "Foreign Affairs";

        let resetFunction = function() {
            resetWarSettings();
            updateSettingsFromState();
            updateWarSettingsContent(secondaryPrefix);
        };

        buildSettingsSection2(parentNode, secondaryPrefix, sectionId, sectionName, resetFunction, updateWarSettingsContent);
    }

    function updateWarSettingsContent(secondaryPrefix) {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $(`#script_${secondaryPrefix}warContent`);
        currentNode.empty().off("*");

        addSettingsHeader1(currentNode, "Foreign Powers");
        addSettingsToggle(currentNode, "foreignPacifist", "Pacifist", "Turns attacks off and on");

        addSettingsToggle(currentNode, "foreignUnification", "Perform unification", "Perform unification once all three powers are controlled. autoResearch should be enabled for this to work.");
        addSettingsToggle(currentNode, "foreignOccupyLast", "Occupy last foreign power", "Occupy last foreign power once other two are controlled, and unification is researched to speed up unification. Disable if you want annex\\purchase achievements.");
        addSettingsToggle(currentNode, "foreignForceSabotage", "Sabotage foreign power when useful", "Perform sabotage against current target if it's useful(power above 50), regardless of required power, and default action defined above");
        addSettingsToggle(currentNode, "foreignTrainSpy", "Train spies", "Train spies to use against foreign powers");
        addSettingsNumber(currentNode, "foreignSpyMax", "Maximum spies", "Maximum spies per foreign power");

        addSettingsNumber(currentNode, "foreignPowerRequired", "Military Power to switch target", "Switches to attack next foreign power once its power lowered down to this number. When exact numbers not know script tries to approximate it.");

        const spyMap = ([name, task]) => ({val: name, label: game.loc("civics_spy_" + task.id), hint: ""});
        let policyOptions = [{val: "Ignore", label: "Ignore", hint: ""},
                             ...Object.entries(SpyManager.Types).map(spyMap),
                             {val: "Occupy", label: "Occupy", hint: ""}];
        addSettingsSelect(currentNode, "foreignPolicyInferior", "Inferior Power", "Perform this against inferior foreign power, with military power equal or below given threshold. Complex actions includes required preparation - Annex and Purchase will incite and influence, Occupy will sabotage, until said options will be available.", policyOptions);
        addSettingsSelect(currentNode, "foreignPolicySuperior", "Superior Power", "Perform this against superior foreign power, with military power above given threshold. Complex actions includes required preparation - Annex and Purchase will incite and influence, Occupy will sabotage, until said options will be available.", policyOptions);

        /*let rivalOptions = [{val: "Ignore", label: "Ignore", hint: ""},
                             ...Object.entries(SpyManager.Types).filter(([name, task]) => task.rival).map(spyMap)];
        addSettingsSelect(currentNode, "foreignPolicyRival", "Rival Power", "Perform this against rival foreign power.", rivalOptions);*/

        // Campaign panel
        addSettingsHeader1(currentNode, "Campaigns");
        addSettingsNumber(currentNode, "foreignAttackLivingSoldiersPercent", "Minimum percentage of alive soldiers for attack", "Only attacks if you ALSO have the target battalion size of healthy soldiers available, so this setting will only take effect if your battalion does not include all of your soldiers");
        addSettingsNumber(currentNode, "foreignAttackHealthySoldiersPercent", "Minimum percentage of healthy soldiers for attack", "Set to less than 100 to take advantage of being able to heal more soldiers in a game day than get wounded in a typical attack");
        addSettingsNumber(currentNode, "foreignHireMercMoneyStoragePercent", "Hire mercenary if money storage greater than percent", "Hire a mercenary if remaining money after purchase will be greater than this percent");
        addSettingsNumber(currentNode, "foreignHireMercCostLowerThanIncome", "OR if cost lower than money earned in X seconds", "Combines with the money storage percent setting to determine when to hire mercenaries");
        addSettingsNumber(currentNode, "foreignHireMercDeadSoldiers", "AND amount of dead soldiers above this number", "Hire a mercenary only when current amount of dead soldiers above given number");

        addSettingsNumber(currentNode, "foreignMinAdvantage", "Minimum advantage", "Minimum advantage to launch campaign, ignored during ambushes. 100% chance to win will be reached at approximately(influenced by traits and selected campaign) 75% advantage.");
        addSettingsNumber(currentNode, "foreignMaxAdvantage", "Maximum advantage", "Once campaign is selected, your battalion will be limited in size down to this advantage, reducing potential loses");
        addSettingsNumber(currentNode, "foreignMaxSiegeBattalion", "Maximum siege battalion", "Maximum battalion for siege campaign. Only try to siege if it's possible with up to given amount of soldiers. Siege is expensive, if you'll be doing it with too big battalion it might be less profitable than other combat campaigns. This option does not applied to unifying sieges, it affect only looting.");
        addSettingsToggle(currentNode, "foreignProtectSoldiers", "Protect soldiers", "Limit battalions to sizes which will neven suffer any casualties in successful fights. You still will lose soldiers after failures, increasing minimum advantage can improve winning odds. This option designed to use with armored races favoring frequent attacks, with no approppriate build it may prevent any attacks from happening. This option does not applied to unifying sieges, it affect only looting.");

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildHellSettings(parentNode, secondaryPrefix) {
        let sectionId = "hell";
        let sectionName = "Hell";

        let resetFunction = function() {
            resetHellSettings();
            updateSettingsFromState();
            updateHellSettingsContent(secondaryPrefix);
        };

        buildSettingsSection2(parentNode, secondaryPrefix, sectionId, sectionName, resetFunction, updateHellSettingsContent);
    }

    function updateHellSettingsContent(secondaryPrefix) {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $(`#script_${secondaryPrefix}hellContent`);
        currentNode.empty().off("*");

        // Entering Hell
        addSettingsToggle(currentNode, "disableHell", "Disable Hell", "Disables autoHell and sets attractor beacons to 0");
        addSettingsNumber(currentNode, "maxSoulGems", "Max soul gems in ascension", "Disables autohell if the soul gem limit is reached in an ascension. 0 to never disable");
        addSettingsHeader1(currentNode, "Entering Hell");
        addSettingsToggle(currentNode, "hellTurnOffLogMessages", "Turn off patrol and surveyor log messages", "Automatically turns off the hell patrol and surveyor log messages");
        addSettingsToggle(currentNode, "hellHandlePatrolCount", "Automatically enter hell and adjust patrol count and hell garrison size", "Sets patrol count according to required garrison and patrol size");
        addSettingsNumber(currentNode, "hellHomeGarrison", "Soldiers to stay out of hell", "Home garrison maximum");
        addSettingsNumber(currentNode, "hellMinSoldiers", "Minimum soldiers to be available for hell (pull out if below)", "Don't enter hell if not enough soldiers, or get out if already in");
        addSettingsNumber(currentNode, "hellMinSoldiersPercent", "Alive soldier percentage for entering hell", "Don't enter hell if too many soldiers are dead, but don't get out");

        // Hell Garrison
        addSettingsHeader1(currentNode, "Hell Garrison");
        addSettingsNumber(currentNode, "hellTargetFortressDamage", "Target wall damage per siege (overestimates threat)", "Actual damage will usually be lower due to patrols and drones");
        addSettingsNumber(currentNode, "hellLowWallsMulti", "Garrison bolster factor for damaged walls", "Multiplies target defense rating by this when close to 0 wall integrity, half as much increase at half integrity");

        // Patrol size
        addSettingsHeader1(currentNode, "Patrol Size");
        addSettingsToggle(currentNode, "hellHandlePatrolSize", "Automatically adjust patrol size", "Sets patrol attack rating based on current threat, lowers it depending on buildings, increases it to the minimum rating, and finally increases it based on dead soldiers. Handling patrol count has to be turned on.");
        addSettingsNumber(currentNode, "hellPatrolMinRating", "Minimum patrol attack rating", "Will never go below this");
        addSettingsNumber(currentNode, "hellPatrolThreatPercent", "Percent of current threat as base patrol rating", "Demon encounters have a rating of 2 to 10 percent of current threat");
        addSettingsNumber(currentNode, "hellPatrolDroneMod", "&emsp;Lower Rating for each active Predator Drone by", "Predators reduce threat before patrols fight");
        addSettingsNumber(currentNode, "hellPatrolDroidMod", "&emsp;Lower Rating for each active War Droid by", "War Droids boost patrol attack rating by 1 or 2 soldiers depending on tech");
        addSettingsNumber(currentNode, "hellPatrolBootcampMod", "&emsp;Lower Rating for each Bootcamp by", "Bootcamps help regenerate soldiers faster");
        addSettingsNumber(currentNode, "hellBolsterPatrolRating", "Increase patrol rating by up to this when soldiers die", "Larger patrols are less effective, but also have fewer deaths");
        addSettingsNumber(currentNode, "hellBolsterPatrolPercentTop", "&emsp;Start increasing patrol rating at this home garrison fill percent", "This is the higher number");
        addSettingsNumber(currentNode, "hellBolsterPatrolPercentBottom", "&emsp;Full patrol rating increase below this home garrison fill percent", "This is the lower number");

        // Attractors
        addSettingsHeader1(currentNode, "Attractors");
        addSettingsNumber(currentNode, "hellAttractorBottomThreat", "&emsp;All Attractors on below this threat", "Turn more and more attractors off when getting nearer to the top threat. Auto Power needs to be on for this to work.");
        addSettingsNumber(currentNode, "hellAttractorTopThreat", "&emsp;All Attractors off above this threat", "Turn more and more attractors off when getting nearer to the top threat. Auto Power needs to be on for this to work.");

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildFleetSettings() {
        let sectionId = "fleet";
        let sectionName = "Fleet";

        let resetFunction = function() {
            resetFleetSettings();
            updateSettingsFromState();
            updateFleetSettingsContent();
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateFleetSettingsContent);
    }

    function updateFleetSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_fleetContent');
        currentNode.empty().off("*");

        addSettingsToggle(currentNode, "fleetMaxCover", "Maximize protection of prioritized systems", "Adjusts ships distribution to fully supress piracy in prioritized regions. Some potential defence will be wasted, as it will use big ships to cover small holes, when it doesn't have anything fitting better. This option is not required: all your dreadnoughts still will be used even without this option.");
        addSettingsNumber(currentNode, "fleetEmbassyKnowledge", "Mininum knowledge for Embassy", "Building Embassy increases maximum piracy up to 100, script won't Auto Build it until this knowledge cap is reached. Note that this option only prevent early autobuilding, and due to huge cost building Embassy will likely take a long even when required knowledge cap is reached. If you're not playing with manual crafting, and not swimming in Wrought Iron - consider building it with queue or trigger instead.");
        addSettingsNumber(currentNode, "fleetAlienGiftKnowledge", "Mininum knowledge for Alien Gift", "Researching Alien Gift increases maximum piracy up to 250, script won't Auto Research it until this knowledge cap is reached.");
        addSettingsNumber(currentNode, "fleetAlien2Knowledge", "Mininum knowledge for Alien 2 Assault", "Assaulting Alien 2 increases maximum piracy up to 500, script won't do it until this knowledge cap is reached. Regardless of set value it won't ever try to assault until you have big enough fleet to do it without loses.");

        let assaultOptions = [{val: "ignore", label: "Manual assault", hint: "Won't ever launch assault mission on Chthonian"},
                              {val: "high", label: "High casualties", hint: "Unlock Chthonian using mixed fleet, high casualties (1250+ total fleet power, 500 will be lost)"},
                              {val: "avg", label: "Average casualties", hint: "Unlock Chthonian using mixed fleet, average casualties (2500+ total fleet power, 160 will be lost)"},
                              {val: "low", label: "Low casualties", hint: "Unlock Chthonian using mixed fleet, low casualties (4500+ total fleet power, 80 will be lost)"},
                              {val: "frigate", label: "Frigate", hint: "Unlock Chthonian loosing Frigate ship(s) (4500+ total fleet power, suboptimal for banana\\instinct runs)"},
                              {val: "dread", label: "Dreadnought", hint: "Unlock Chthonian with Dreadnought suicide mission"}];
        addSettingsSelect(currentNode, "fleetChthonianLoses", "Chthonian Mission", "Assault Chthonian when chosen outcome is achievable. Mixed fleet formed to clear mission with minimum possible wasted ships, e.g. for low causlities it can sacriface 8 scouts, or 2 corvettes and 2 scouts, or frigate, and such. Whatever will be first available. It also takes in account perks and challenges, adjusting fleet accordingly.", assaultOptions);

        currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:95%">Region</th>
              <th style="width:5%"></th>
            </tr>
            <tbody id="script_fleetTableBody"></tbody>
          </table>`);

        let tableBodyNode = $('#script_fleetTableBody');
        let newTableBodyText = "";

        let priorityRegions = galaxyRegions.slice().sort((a, b) => settings["fleet_pr_" + a] - settings["fleet_pr_" + b]);
        for (let i = 0; i < priorityRegions.length; i++) {
            newTableBodyText += `<tr value="${priorityRegions[i]}" class="script-draggable"><td id="script_fleet_${priorityRegions[i]}" style="width:95%"><td style="width:5%"><span class="script-lastcolumn"></span></td></tr>`;
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other productions settings rows
        for (let i = 0; i < galaxyRegions.length; i++) {
            let fleetElement = $('#script_fleet_' + galaxyRegions[i]);
            let nameRef = galaxyRegions[i] === "gxy_alien1" ? "Alien 1 System" : galaxyRegions[i] === "gxy_alien2" ? "Alien 2 System" : game.actions.galaxy[galaxyRegions[i]].info.name;

            fleetElement.append(buildStandartLabel(typeof nameRef === "function" ? nameRef() : nameRef));
        }

        $('#script_fleetTableBody').sortable({
            items: "tr:not(.unsortable)",
            helper: function(event, ui){
                let clone = $(ui).clone();
                clone.css('position','absolute');
                return clone.get(0);
            },
            update: function() {
                let regionIds = $('#script_fleetTableBody').sortable('toArray', {attribute: 'value'});
                for (let i = 0; i < regionIds.length; i++) {
                    settings["fleet_pr_" + regionIds[i]] = i;
                }

                updateSettingsFromState();
            },
        });

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function resetFleetSettings() {
        galaxyRegions.forEach((id, index) => settings["fleet_pr_" + id] = index);
        settings.fleetMaxCover = true;
        settings.fleetEmbassyKnowledge = 6000000;
        settings.fleetAlienGiftKnowledge = 6500000;
        settings.fleetAlien2Knowledge = 9000000;
        settings.fleetChthonianLoses = "frigate";
    }

    function buildMechSettings() {
        let sectionId = "mech";
        let sectionName = "Mech & Spire";

        let resetFunction = function() {
            resetMechSettings();
            updateSettingsFromState();
            updateMechSettingsContent();
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateMechSettingsContent);
    }

    function updateMechSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_mechContent');
        currentNode.empty().off("*");

        let scrapOptions = [{val: "none", label: "None", hint: "Nothing will be scrapped automatically"},
                            {val: "single", label: "Full bay", hint: "Scrap mechs only when mech bay is full, and script need more room to build mechs"},
                            {val: "all", label: "All inefficient", hint: "Scrap all inefficient mechs immediately, using refounded resources to build better ones"},
                            {val: "mixed", label: "Excess inefficient", hint: "Scrap as much inefficient mechs as possible, trying to preserve just  enough of old mechs to fill bay to max by the time when next floor will be reached, calculating threshold based on progress speed and resources incomes"}];
        addSettingsSelect(currentNode, "mechScrap", "Scrap mechs", "Configures what will be scrapped. Infernal mechs won't ever be scrapped.", scrapOptions);
        addSettingsNumber(currentNode, "mechScrapEfficiency", "Scrap efficiency", "Scrap mechs only when '((OldMechRefund / NewMechCost) / (OldMechPower / NewMechPower))' more than given number.&#xA;For the cases when exchanged mechs have same size(1/3 refund) it means that with 1 eff. script allowed to scrap mechs under 33.3%. 1.5 eff. - under 22.2%, 2 eff. - under 16.6%, 0.5 eff. - under 66.6%, 0 eff. - under 100%, etc.&#xA;Efficiency below '1' is not recommended, unless scrap set to 'Full bay', as it's a breakpoint when refunded resources can immidiately compensate lost power, resulting with best power growth rate.&#xA;Efficiency above '1' is useful to save resources for more desperate times, or to compensate low soul gems income.");

        let buildOptions = [{val: "none", label: "None", hint: "Nothing will be build automatically"},
                            {val: "random", label: "Random good", hint: "Build random mech with size chosen below, and best possible efficiency"},
                            {val: "user", label: "Current design", hint: "Build whatever currently set in Mech Lab"}];
        addSettingsSelect(currentNode, "mechBuild", "Build mechs", "Configures what will be build. Infernal mechs won't ever be build.", buildOptions);

        let sizeOptions = [{val: "auto", label: "Most efficient", hint: "Select mech with best power per size for current floor, based on current amount of Soul Gems, and Supplies storage cap"}, ...MechManager.Size.map(id => ({val: id, label: game.loc(`portal_mech_size_${id}`), hint: game.loc(`portal_mech_size_${id}_desc`)}))];
        addSettingsSelect(currentNode, "mechSize", "Preferred mech size", "Size of random mechs", sizeOptions);
        addSettingsSelect(currentNode, "mechSizeGravity", "Gravity mech size", "Override preferred size with this on floors with high gravity", sizeOptions);

        let specialOptions = [{val: "always", label: "Always", hint: "Add special equipment to all mechs"},
                              {val: "prefered", label: "Preferred", hint: "Add special equipment when it doesn't reduce efficiency for current floor"},
                              {val: "random", label: "Random", hint: "Special equipment will have same chance to be added as all others"},
                              {val: "never", label: "Never", hint: "Never add special equipment"}];
        addSettingsSelect(currentNode, "mechSpecial", "Special mechs", "Configures special equip", specialOptions);
        addSettingsNumber(currentNode, "mechScouts", "Minimum scouts ratio", "Scouts compensate terrain penalty of suboptimal mechs. Build them up to this ratio.");
        addSettingsNumber(currentNode, "mechMinSupply", "Minimum supply income", "Build collectors if current supply income above given number");
        addSettingsNumber(currentNode, "mechMaxCollectors", "Maximum collectors ratio", "Limiter for above option, maximum space used by collectors");
        addSettingsNumber(currentNode, "mechWaygatePotential", "Maximum mech potential for Waygate", "Fight Demon Lord only when current mech team potential below given amount. Full bay of best mechs will have `1` potential. Damage against Demon Lord does not affected by floor modifiers, all mechs always does 100% damage to him. Thus it's most time-efficient to fight him at times when mechs can't make good progress against regular monsters, and waiting for rebuilding. Auto Power needs to be on for this to work.");
        addSettingsToggle(currentNode, "mechSaveSupply", "Save up full supplies for next floor", "Stop building new mechs close to next floor, preparing to build bunch of new mechs suited for next enemy");
        addSettingsToggle(currentNode, "mechFillBay", "Build smaller mechs when preferred not available", "Build smaller mechs when preferred size can't be used due to low remaining bay space, or supplies cap");
        addSettingsToggle(currentNode, "buildingMechsFirst", "Build spire buildings only with full bay", "Fill mech bays up to current limit before spending resources on additional spire buildings");
        addSettingsToggle(currentNode, "mechBaysFirst", "Scrap mechs only after building maximum bays", "Scrap old mechs only when no new bays and purifiers can be builded");

        addStandardHeading(currentNode, "Mech Stats");
        let statsControls = $(`<div style="margin-top: 5px; display: inline-flex;"></div>`);
        Object.entries({Compact: true, Efficient: true, Special: true, Gravity: false}).forEach(([option, value]) => {
            statsControls.append(`
              <label class="switch" title="This switch have no ingame effect, and used to configure calculator below">
                <input id="script_mechStats${option}" type="checkbox"${value ? " checked" : ""}>
                <span class="check"></span><span style="margin-left: 10px;">${option}</span>
              </label>`);
        });
        statsControls.append(`
          <label class="switch" title="This input have no ingame effect, and used to configure calculator below">
            <input id="script_mechStatsScouts" class="input is-small" style="height: 25px; width: 50px" type="text" value="0">
            <span style="margin-left: 10px;">Scouts</span>
          </label>`);
        statsControls.on('input', calculateMechStats);
        currentNode.append(statsControls);
        currentNode.append(`<table class="selectable"><tbody id="script_mechStatsTable"><tbody></table>`);
        calculateMechStats();

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function calculateMechStats(currentNode) {
        let realBay = game.global.portal.mechbay // Ugly hack, and also won't work once(if) poly will be replaced with exposed function. But for now - it just works.
        let realPrepared = game.global.blood.prepared;

        let cellInfo = '<td><span class="has-text-info">';
        let cellWarn = '<td><span class="has-text-warning">';
        let cellAdv = '<td><span class="has-text-advanced">';
        let cellEnd = '</span></td>';
        let content = "";

        let special = document.getElementById('script_mechStatsSpecial').checked;
        let gravity = document.getElementById('script_mechStatsGravity').checked;
        let efficient = document.getElementById('script_mechStatsEfficient').checked;
        let scouts = parseInt(document.getElementById("script_mechStatsScouts").value) || 0;

        game.global.portal.mechbay = {max: Number.MAX_SAFE_INTEGER, mechs: new Array(Math.max(0, scouts)).fill({size: "small"})};
        game.global.blood.prepared = document.getElementById('script_mechStatsCompact').checked ? 2 : 0;

        let smallFactor = efficient ? 1 : average(Object.values(MechManager.SmallChassisMod).reduce((list, mod) => list.concat(Object.values(mod)), []));
        let largeFactor = efficient ? 1 : average(Object.values(MechManager.LargeChassisMod).reduce((list, mod) => list.concat(Object.values(mod)), []));
        let weaponFactor = efficient ? 1 : average(Object.values(poly.monsters).reduce((list, mod) => list.concat(Object.values(mod.weapon)), []));

        let rows = [[""], ["Power Per Size"], ["Power Per Supply"], ["Power Per Gems"]];
        for (let i = 0; i < MechManager.Size.length - 1; i++) { // Exclude collectors
            let mech = {size: MechManager.Size[i], equip: special ? ['special'] : []};

            let basePower = MechManager.getSizeMod(mech, false);
            let statusMod = gravity ? MechManager.StatusMod.gravity(mech) : 1;
            let terrainMod = poly.terrainRating(mech, i < 2 ? smallFactor : largeFactor, gravity ? ['gravity'] : []);
            let weaponMod = poly.weaponPower(mech, weaponFactor) * MechManager.SizeWeapons[mech.size];
            let power = basePower * statusMod * terrainMod * weaponMod;

            let [gems, cost, space] = MechManager.getMechCost(mech);
            rows[0].push(game.loc("portal_mech_size_" + mech.size));
            rows[1].push((power / space * 100).toFixed(4));
            rows[2].push((power / (cost / 100000) * 100).toFixed(4));
            rows[3].push((power / gems  * 100).toFixed(4));
        }
        rows.forEach((line, index, arr) => content += "<tr>" + (index === 0 ? cellWarn : cellAdv) + line.join("&nbsp;" + cellEnd + (index === 0 ? cellAdv : cellInfo)) + cellEnd + "</tr>");
        $("#script_mechStatsTable").html(content);

        if (realBay) { game.global.portal.mechbay = realBay; }
        if (realPrepared) { game.global.blood.prepared = realPrepared; }
    }

    function resetMechSettings() {
        settings.mechScrap = "mixed";
        settings.mechScrapEfficiency = 2;
        settings.mechBuild = "random";
        settings.mechSize = "titan";
        settings.mechSizeGravity = "auto";
        settings.mechFillBay = true;
        settings.mechScouts = 0.05;
        settings.mechMinSupply = 1000;
        settings.mechMaxCollectors = 0.5;
        settings.mechSpecial = "prefered";
        settings.mechSaveSupply = true;
        settings.buildingMechsFirst = true;
        settings.mechBaysFirst = true;
        settings.mechWaygatePotential = 0.4;
    }

    function buildEjectorSettings() {
        let sectionId = "ejector";
        let sectionName = "Ejector & Supply";

        let resetFunction = function() {
            resetEjectorState();
            resetEjectorSettings();
            updateSettingsFromState();
            updateEjectorSettingsContent();

            // Redraw toggles on market tab
            if ($('#resEjector .ea-eject-toggle').length > 0) {
                createEjectToggles();
            }
            if ($('#resCargo .ea-supply-toggle').length > 0) {
                createSupplyToggles();
            }
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateEjectorSettingsContent);
    }

    function updateEjectorSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_ejectorContent');
        currentNode.empty().off("*");

        addSettingsToggle(currentNode, "autoSupply", "Manage Supplies", "Send excess resources to Spire. Normal resources send when they're near storage cap, craftables - when above requirements. Takes priority over ejector.");

        currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:30%">Resource</th>
              <th class="has-text-warning" style="width:20%">Atomic Mass</th>
              <th class="has-text-warning" style="width:10%">Eject</th>
              <th class="has-text-warning" style="width:30%">Supply Value</th>
              <th class="has-text-warning" style="width:10%">Supply</th>
            </tr>
            <tbody id="script_ejectorTableBody"></tbody>
          </table>`);

        let tableBodyNode = $('#script_ejectorTableBody');
        let newTableBodyText = "";

        let tabResources = [];
        for (let id in resources) {
            let resource = resources[id];
            if (resource.isEjectable() || resource.isSupply()) {
                tabResources.push(resource);
                newTableBodyText += `<tr><td id="script_eject_${resource.id}" style="width:30%"></td><td style="width:20%"></td><td style="width:10%"></td><td style="width:30%"></td><td style="width:10%"></td></tr>`;
            }
        }

        tableBodyNode.append($(newTableBodyText));

        for (let i = 0; i < tabResources.length; i++) {
            let resource = tabResources[i];
            let ejectElement = $('#script_eject_' + resource.id);

            ejectElement.append(buildEjectorLabel(resource));

            if (resource.isEjectable()) {
                ejectElement = ejectElement.next();
                ejectElement.append(`<span class="mass"><span class="has-text-warning">${resource.atomicMass}</span> kt</span>`);

                ejectElement = ejectElement.next();
                ejectElement.append(buildStandartSettingsToggle(resource, "ejectEnabled", "script_eject2_" + resource.id, "script_eject1_" + resource.id));
            } else {
                ejectElement = ejectElement.next().next();
            }

            if (resource.isSupply()) {
                ejectElement = ejectElement.next();
                ejectElement.append(`<span class="mass">Export <span class="has-text-caution">${resource.supplyVolume}</span>, Gain <span class="has-text-success">${resource.supplyValue}</span></span>`);

                ejectElement = ejectElement.next();
                ejectElement.append(buildStandartSettingsToggle(resource, "supplyEnabled", "script_supply2_" + resource.id, "script_supply1_" + resource.id));
            }
        }

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildEjectorLabel(resource) {
        let color = "has-text-info";
        if (resource === resources.Elerium || resource === resources.Infernite) {
            color = "has-text-caution";
        } else if (resource.isCraftable()) {
            color = "has-text-danger";
        } else if (!resource.isTradable()) {
            color = "has-text-advanced";
        }

        return $(`<span class="${color}">${resource.name}</span>`);
    }

    function resetEjectorState() {
        resourcesByAtomicMass.forEach(resource => resource.ejectEnabled = resource.isTradable());
        resourcesBySupplyValue.forEach(resource => resource.supplyEnabled = resource.isTradable());

        resources.Elerium.ejectEnabled = true;
        resources.Infernite.ejectEnabled = true;
    }

    function resetEjectorSettings() {
        settings.autoSupply = false;
    }

    function buildMarketSettings() {
        let sectionId = "market";
        let sectionName = "Market";

        let resetFunction = function() {
            resetMarketState();
            resetMarketSettings();
            updateSettingsFromState();
            updateMarketSettingsContent();

            // Redraw toggles on market tab
            if ($('#market .ea-market-toggle').length > 0) {
                createMarketToggles();
            }
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateMarketSettingsContent);
    }

    function updateMarketSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_marketContent');
        currentNode.empty().off("*");

        addSettingsNumber(currentNode, "tradeRouteMinimumMoneyPerSecond", "Trade minimum money /s", "Uses the highest per second amount of these two values. Will trade for resources until this minimum money per second amount is hit");
        addSettingsNumber(currentNode, "tradeRouteMinimumMoneyPercentage", "Trade minimum money percentage /s", "Uses the highest per second amount of these two values. Will trade for resources until this percentage of your money per second amount is hit");
        addSettingsToggle(currentNode, "tradeRouteSellExcess", "Sell excess resources", "With this option enabled script will be allowed to sell resources above amounts needed for constructions or researches, without it script sell only capped resources. As side effect boughts will also be limited to that amounts, to avoid 'buy up to cap -> sell excess' loops.");

        currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" colspan="1"></th>
              <th class="has-text-warning" colspan="4">Manual Trades</th>
              <th class="has-text-warning" colspan="4">Trade Routes</th>
              <th class="has-text-warning" colspan="1"></th>
            </tr>
            <tr>
              <th class="has-text-warning" style="width:15%">Resource</th>
              <th class="has-text-warning" style="width:10%">Buy</th>
              <th class="has-text-warning" style="width:10%">Ratio</th>
              <th class="has-text-warning" style="width:10%">Sell</th>
              <th class="has-text-warning" style="width:10%">Ratio</th>
              <th class="has-text-warning" style="width:10%">In</th>
              <th class="has-text-warning" style="width:10%">Away</th>
              <th class="has-text-warning" style="width:10%">Weighting</th>
              <th class="has-text-warning" style="width:10%">Priority</th>
              <th style="width:5%"></th>
            </tr>
            <tbody id="script_marketTableBody"></tbody>
          </table>`);

        let tableBodyNode = $('#script_marketTableBody');
        let newTableBodyText = "";

        for (let i = 0; i < MarketManager.priorityList.length; i++) {
            const resource = MarketManager.priorityList[i];
            newTableBodyText += `<tr value="${resource.id}" class="script-draggable"><td id="script_market_${resource.id}" style="width:15%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:5%"></td></tr>`;
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other markets settings rows
        for (let i = 0; i < MarketManager.priorityList.length; i++) {
            const resource = MarketManager.priorityList[i];
            let marketElement = $('#script_market_' + resource.id);

            marketElement.append(buildStandartLabel(resource.name));

            marketElement = marketElement.next();
            marketElement.append(buildStandartSettingsToggle(resource, "autoBuyEnabled", "script_buy2_" + resource.id, "script_buy1_" + resource.id));

            marketElement = marketElement.next();
            marketElement.append(buildStandartSettingsInput(resource, "res_buy_r_" + resource.id, "autoBuyRatio"));

            marketElement = marketElement.next();
            marketElement.append(buildStandartSettingsToggle(resource, "autoSellEnabled", "script_sell2_" + resource.id, "script_sell1_" + resource.id));

            marketElement = marketElement.next();
            marketElement.append(buildStandartSettingsInput(resource, "res_sell_r_" + resource.id, "autoSellRatio"));

            marketElement = marketElement.next();
            marketElement.append(buildStandartSettingsToggle(resource, "autoTradeBuyEnabled", "script_tbuy2_" + resource.id, "script_tbuy1_" + resource.id));

            marketElement = marketElement.next();
            marketElement.append(buildStandartSettingsToggle(resource, "autoTradeSellEnabled", "script_tsell2_" + resource.id, "script_tsell1_" + resource.id));

            marketElement = marketElement.next();
            marketElement.append(buildStandartSettingsInput(resource, "res_trade_w_" + resource.id, "autoTradeWeighting"));

            marketElement = marketElement.next();
            marketElement.append(buildStandartSettingsInput(resource, "res_trade_p_" + resource.id, "autoTradePriority"));

            marketElement = marketElement.next();
            marketElement.append($('<span class="script-lastcolumn"></span>'));
        }

        $('#script_marketTableBody').sortable({
            items: "tr:not(.unsortable)",
            helper: function(event, ui){
                let clone = $(ui).clone();
                clone.css('position','absolute');
                return clone.get(0);
            },
            update: function() {
                let marketIds = $('#script_marketTableBody').sortable('toArray', {attribute: 'value'});

                for (let i = 0; i < marketIds.length; i++) {
                    // Market has been dragged... Update all market priorities
                    MarketManager.priorityList.find(resource => resource.id === marketIds[i]).marketPriority = i;
                }

                MarketManager.sortByPriority();
                updateSettingsFromState();
            },
        });

        addStandardHeading(currentNode, "Galaxy Trades");

        currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:30%">Buy</th>
              <th class="has-text-warning" style="width:30%">Sell</th>
              <th class="has-text-warning" style="width:20%">Weighting</th>
              <th class="has-text-warning" style="width:20%">Priority</th>
            </tr>
            <tbody id="script_marketGalaxyTableBody"></tbody>
          </table>`);

        tableBodyNode = $('#script_marketGalaxyTableBody');
        newTableBodyText = "";

        for (let i = 0; i < poly.galaxyOffers.length; i++) {
            newTableBodyText += `<tr><td id="script_market_galaxy_${i}" style="width:30%"><td style="width:30%"></td></td><td style="width:20%"></td><td style="width:20%"></td></tr>`;
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other productions settings rows
        for (let i = 0; i < poly.galaxyOffers.length; i++) {
            let trade = poly.galaxyOffers[i];
            let buyResource = resources[trade.buy.res];
            let sellResource = resources[trade.sell.res];
            let marketElement = $('#script_market_galaxy_' + i);

            marketElement.append(buildStandartLabel(buyResource.name, "has-text-success"));

            marketElement = marketElement.next();
            marketElement.append(buildStandartLabel(sellResource.name, "has-text-danger"));

            marketElement = marketElement.next();
            marketElement.append(buildStandartSettingsInput(buyResource, "res_galaxy_w_" + buyResource.id, "galaxyMarketWeighting"));

            marketElement = marketElement.next();
            marketElement.append(buildStandartSettingsInput(buyResource, "res_galaxy_p_" + buyResource.id, "galaxyMarketPriority"));
       }

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildStorageSettings() {
        let sectionId = "storage";
        let sectionName = "Storage";

        let resetFunction = function() {
            resetStorageState();
            resetStorageSettings();
            updateSettingsFromState();
            updateStorageSettingsContent();

            // Redraw toggles on storage tab
            if ($('#resStorage .ea-storage-toggle').length > 0) {
                createStorageToggles();
            }
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateStorageSettingsContent);
    }

    function updateStorageSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_storageContent');
        currentNode.empty().off("*");

        addSettingsToggle(currentNode, "storageLimitPreMad", "Limit Pre-MAD Storage", "Saves resources and shortens run time by limiting storage pre-MAD");
        addSettingsToggle(currentNode, "storageSafeReassign", "Reassign only empty storages", "Wait until storage is empty before reassigning containers to another resource, to prevent overflowing and wasting resources");
        addSettingsToggle(currentNode, "storageAssignExtra", "Assign buffer storage", "Assigns 3% more resources above required amounts, ensuring that required quantity will be actually reached, even if other part of script trying to sell\\eject\\switch production, etc.");
        addSettingsToggle(currentNode, "storagePrioritizedOnly", "Assign only for prioritized resources", "Assign storages only for prioritized resources, up to amount required by whatever demanded it. Such as queue or trigger costs. You don't normally need it, this can be useful when you need all your storage space to afford single building, and want to fully focus on it. Warning! Enabling this option without `Reassign only empty storages` will instantly unassign all your crates and containers, and may lead to loss of resources.");

        currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:35%">Resource</th>
              <th class="has-text-warning" style="width:15%">Enabled</th>
              <th class="has-text-warning" style="width:15%">Store Overflow</th>
              <th class="has-text-warning" style="width:15%">Max Crates</th>
              <th class="has-text-warning" style="width:15%">Max Containers</th>
              <th style="width:5%"></th>
            </tr>
            <tbody id="script_storageTableBody"></tbody>
          </table>`);

        let tableBodyNode = $('#script_storageTableBody');
        let newTableBodyText = "";

        for (let i = 0; i < StorageManager.priorityList.length; i++) {
            const resource = StorageManager.priorityList[i];
            newTableBodyText += `<tr value="${resource.id}" class="script-draggable"><td id="script_storage_${resource.id}" style="width:35%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:5%"><span class="script-lastcolumn"></span></td></tr>`;
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other storages settings rows
        for (let i = 0; i < StorageManager.priorityList.length; i++) {
            const resource = StorageManager.priorityList[i];
            let storageElement = $('#script_storage_' + resource.id);

            storageElement.append(buildStandartLabel(resource.name));

            storageElement = storageElement.next();
            storageElement.append(buildStandartSettingsToggle(resource, "autoStorageEnabled", "script_res_storage2_" + resource.id, "script_res_storage1_" + resource.id));

            storageElement = storageElement.next();
            storageElement.append(buildStandartSettingsToggle(resource, "storeOverflow", "script_res_overflow2_" + resource.id, "script_res_overflow1_" + resource.id));

            storageElement = storageElement.next();
            storageElement.append(buildStandartSettingsInput(resource, "res_crates_m_" + resource.id, "_autoCratesMax"));

            storageElement = storageElement.next();
            storageElement.append(buildStandartSettingsInput(resource, "res_containers_m_" + resource.id, "_autoContainersMax"));
        }

        $('#script_storageTableBody').sortable({
            items: "tr:not(.unsortable)",
            helper: function(event, ui){
                let clone = $(ui).clone();
                clone.css('position','absolute');
                return clone.get(0);
            },
            update: function() {
                let storageIds = $('#script_storageTableBody').sortable('toArray', {attribute: 'value'});

                for (let i = 0; i < storageIds.length; i++) {
                    // Storage has been dragged... Update all storage priorities
                    StorageManager.priorityList.find(resource => resource.id === storageIds[i]).storagePriority = i;
                }

                StorageManager.sortByPriority();
                updateSettingsFromState();
            },
        });

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildMinorTraitSettings() {
        let sectionId = "minorTrait";
        let sectionName = "Minor Trait";

        let resetFunction = function() {
            resetMinorTraitState();
            updateSettingsFromState();
            updateMinorTraitSettingsContent();
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateMinorTraitSettingsContent);
    }

    function updateMinorTraitSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_minorTraitContent');
        currentNode.empty().off("*");

        currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:20%">Minor Trait</th>
              <th class="has-text-warning" style="width:20%">Enabled</th>
              <th class="has-text-warning" style="width:20%">Weighting</th>
              <th class="has-text-warning" style="width:40%"></th>
            </tr>
            <tbody id="script_minorTraitTableBody"></tbody>
          </table>`);

        let tableBodyNode = $('#script_minorTraitTableBody');
        let newTableBodyText = "";

        for (let i = 0; i < MinorTraitManager.priorityList.length; i++) {
            const trait = MinorTraitManager.priorityList[i];
            newTableBodyText += `<tr value="${trait.traitName}" class="script-draggable"><td id="script_minorTrait_${trait.traitName}" style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:40%"><span class="script-lastcolumn"></span></td></tr>`;
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other minorTraits settings rows
        for (let i = 0; i < MinorTraitManager.priorityList.length; i++) {
            const trait = MinorTraitManager.priorityList[i];
            let minorTraitElement = $('#script_minorTrait_' + trait.traitName);

            let toggle = $(`<span title="${game.loc("trait_"+trait.traitName)}" class="has-text-info" style="margin-left: 20px;">${game.loc("trait_"+trait.traitName+"_name")}</span>`);
            minorTraitElement.append(toggle);

            minorTraitElement = minorTraitElement.next();
            minorTraitElement.append(buildStandartSettingsToggle(trait, "enabled", "script_mTrait_" + trait.traitName));

            minorTraitElement = minorTraitElement.next();
            minorTraitElement.append(buildStandartSettingsInput(trait, "mTrait_w_" + trait.traitName, "weighting"));
        }

        $('#script_minorTraitTableBody').sortable({
            items: "tr:not(.unsortable)",
            helper: function(event, ui){
                let clone = $(ui).clone();
                clone.css('position','absolute');
                return clone.get(0);
            },
            update: function() {
                let minorTraitNames = $('#script_minorTraitTableBody').sortable('toArray', {attribute: 'value'});

                for (let i = 0; i < minorTraitNames.length; i++) {
                    // MinorTrait has been dragged... Update all minorTrait priorities
                    MinorTraitManager.priorityList.find(trait => trait.traitName === minorTraitNames[i]).priority = i;
                }

                MinorTraitManager.sortByPriority();
                updateSettingsFromState();
            },
        });

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildProductionSettings() {
        let sectionId = "production";
        let sectionName = "Production";

        let resetFunction = function() {
            resetProductionState();
            resetProductionSettings();
            updateSettingsFromState();
            updateProductionSettingsContent();

            // Redraw toggles in resources tab
            if ($('#resources .ea-craft-toggle').length > 0) {
              removeCraftToggles();
              createCraftToggles();
            }
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateProductionSettingsContent);
    }

    function updateProductionSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_productionContent');
        currentNode.empty().off("*");

        addSettingsNumber(currentNode, "productionChrysotileWeight", "Chrysotile weighting", "Chrysotile weighting for autoQuarry, applies after adjusting to difference between current amounts of Stone and Chrysotile");
        updateProductionTableSmelter(currentNode);
        updateProductionTableFoundry(currentNode);
        updateProductionTableFactory(currentNode);
        updateProductionTableMiningDrone(currentNode);
        updateProductionTablePylon(currentNode);

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function updateProductionTableSmelter(currentNode) {
        addStandardHeading(currentNode, "Smelter");

        let smelterOptions = [{val: "iron", label: "Prioritize Iron", hint: "Produce only Iron, untill storage capped, and switch to Steel after that"},
                              {val: "steel", label: "Prioritize Steel", hint: "Produce as much Steel as possible, untill storage capped, and switch to Iron after that"},
                              {val: "storage", label: "Up to full storages", hint: "Produce both Iron and Steel at ratio which will fill both storages at same time for both"},
                              {val: "required", label: "Up to required amounts", hint: "Produce both Iron and Steel at ratio which will produce maximum amount of resources required for buildings at same time for both"}];
        addSettingsSelect(currentNode, "productionSmelting", "Smelters production", "Distribution of smelters between iron and steel", smelterOptions);

        currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:95%">Fuel</th>
              <th style="width:5%"></th>
            </tr>
            <tbody id="script_productionTableBodySmelter"></tbody>
          </table>`);

        let tableBodyNode = $('#script_productionTableBodySmelter');
        let newTableBodyText = "";

        let smelterFuels = SmelterManager.managedFuelPriorityList();

        for (let i = 0; i < smelterFuels.length; i++) {
            let fuel = smelterFuels[i];
            newTableBodyText += `<tr value="${fuel.id}" class="script-draggable"><td id="script_smelter_${fuel.id}" style="width:95%"></td><td style="width:5%"><span class="script-lastcolumn"></span></td></tr>`;
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other productions settings rows
        for (let i = 0; i < smelterFuels.length; i++) {
            let fuel = smelterFuels[i];
            let productionElement = $('#script_smelter_' + fuel.id);

            productionElement.append(buildStandartLabel(fuel.id));
        }

        $('#script_productionTableBodySmelter').sortable({
            items: "tr:not(.unsortable)",
            helper: function(event, ui){
                let clone = $(ui).clone();
                clone.css('position','absolute');
                return clone.get(0);
            },
            update: function() {
                let fuelIds = $('#script_productionTableBodySmelter').sortable('toArray', {attribute: 'value'});

                let smelterFuels = Object.values(SmelterManager.Fuels);
                for (let i = 0; i < fuelIds.length; i++) {
                    smelterFuels.find(fuel => fuel.id === fuelIds[i]).priority = i;
                }

                updateSettingsFromState();
            },
        });
    }

    function updateProductionTableFactory(currentNode) {
        addStandardHeading(currentNode, "Factory");
        addSettingsNumber(currentNode, "productionFactoryMinIngredients", "Minimum materials to preserve", "Factory will craft resources only when all required material above given ration");

        currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:35%">Resource</th>
              <th class="has-text-warning" style="width:20%">Enabled</th>
              <th class="has-text-warning" style="width:20%">Weighting</th>
              <th class="has-text-warning" style="width:20%">Priority</th>
              <th style="width:5%"></th>
            </tr>
            <tbody id="script_productionTableBodyFactory"></tbody>
          </table>`);

        let tableBodyNode = $('#script_productionTableBodyFactory');
        let newTableBodyText = "";

        let productionSettings = Object.values(FactoryManager.Productions);

        for (let i = 0; i < productionSettings.length; i++) {
            let production = productionSettings[i];
            newTableBodyText += `<tr><td id="script_factory_${production.resource.id}" style="width:35%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:5%"></td></tr>`;
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other productions settings rows
        for (let i = 0; i < productionSettings.length; i++) {
            let production = productionSettings[i];
            let productionElement = $('#script_factory_' + production.resource.id);

            productionElement.append(buildStandartLabel(production.resource.name));

            productionElement = productionElement.next();
            productionElement.append(buildStandartSettingsToggle(production, "enabled", "script_factory_" + production.resource.id));

            productionElement = productionElement.next();
            productionElement.append(buildStandartSettingsInput(production, "production_w_" + production.resource.id, "weighting"));

            productionElement = productionElement.next();
            productionElement.append(buildStandartSettingsInput(production, "production_p_" + production.resource.id, "priority"));
        }
    }

    function updateProductionTableFoundry(currentNode) {
        addStandardHeading(currentNode, "Foundry");
        let weightingOptions = [{val: "none", label: "None", hint: "Use configured weightings with no additional adjustments, craftables with x2 weighting will be crafted two times more intense than with x1, etc."},
                                {val: "demanded", label: "Prioritize demanded", hint: "Ignore craftables once stored amount surpass cost of most expensive building, until all missing resources will be crafted. After that works as with 'none' adjustments."},
                                {val: "buildings", label: "Buildings weightings", hint: "Uses weightings of buildings which are waiting for craftables, as multipliers to craftables weighting. This option requires autoBuild."}];
        addSettingsSelect(currentNode, "productionFoundryWeighting", "Weightings adjustments", "Configures how exactly craftables will be weighted against each other", weightingOptions);

        currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:35%">Resource</th>
              <th class="has-text-warning" style="width:20%">Enabled</th>
              <th class="has-text-warning" style="width:20%">Weighting</th>
              <th class="has-text-warning" style="width:20%">Min Ingredients</th>
              <th style="width:5%"></th>
            </tr>
            <tbody id="script_productionTableBodyFoundry"></tbody>
          </table>`);

        let tableBodyNode = $('#script_productionTableBodyFoundry');
        let newTableBodyText = "";

        for (let i = 0; i < state.craftableResourceList.length; i++) {
            let resource = state.craftableResourceList[i];
            newTableBodyText += `<tr><td id="script_foundry_${resource.id}" style="width:35%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:5%"></td></tr>`;
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other productions settings rows
        for (let i = 0; i < state.craftableResourceList.length; i++) {
            let resource = state.craftableResourceList[i];
            let productionElement = $('#script_foundry_' + resource.id);

            productionElement.append(buildStandartLabel(resource.name));

            productionElement = productionElement.next();
            productionElement.append(buildStandartSettingsToggle(resource, "autoCraftEnabled", "script_craft2_" + resource.id, "script_craft1_" + resource.id));

            productionElement = productionElement.next();
            if (resource == resources.Scarletite) {
                productionElement.append('<span>Managed</span>');
            } else {
                productionElement.append(buildStandartSettingsInput(resource, "foundry_w_" + resource.id, "craftWeighting"));
            }

            productionElement = productionElement.next();
            productionElement.append(buildStandartSettingsInput(resource, "foundry_p_" + resource.id, "craftPreserve"));
        }
    }

    function updateProductionTableMiningDrone(currentNode) {
        addStandardHeading(currentNode, "Mining Drone");

        currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:35%">Resource</th>
              <th class="has-text-warning" style="width:20%"></th>
              <th class="has-text-warning" style="width:20%">Weighting</th>
              <th class="has-text-warning" style="width:20%">Priority</th>
              <th style="width:5%"></th>
            </tr>
            <tbody id="script_productionTableBodyMiningDrone"></tbody>
          </table>`);

        let tableBodyNode = $('#script_productionTableBodyMiningDrone');
        let newTableBodyText = "";

        let droidProducts = Object.values(DroidManager.Productions);

        for (let i = 0; i < droidProducts.length; i++) {
            let production = droidProducts[i];
            newTableBodyText += `<tr><td id="script_droid_${production.resource.id}" style="width:35%"><td style="width:20%"></td><td style="width:20%"></td></td><td style="width:20%"></td><td style="width:5%"></td></tr>`;
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other productions settings rows
        for (let i = 0; i < droidProducts.length; i++) {
            let production = droidProducts[i];
            let productionElement = $('#script_droid_' + production.resource.id);

            productionElement.append(buildStandartLabel(production.resource.name));

            productionElement = productionElement.next().next();
            productionElement.append(buildStandartSettingsInput(production, "droid_w_" + production.resource.id, "weighting"));

            productionElement = productionElement.next();
            productionElement.append(buildStandartSettingsInput(production, "droid_pr_" + production.resource.id, "priority"));
        }
    }

    function updateProductionTablePylon(currentNode) {
        addStandardHeading(currentNode, "Pylon");
        addSettingsNumber(currentNode, "productionRitualManaUse", "Mana income used", "Income portion to use on rituals. Setting to 1 is not recomended, as it will halt mana regeneration. Applied only when mana not capped - with capped mana script will always use all income.");

        currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:55%">Ritual</th>
              <th class="has-text-warning" style="width:20%">Weighting</th>
              <th style="width:25%"></th>
            </tr>
            <tbody id="script_productionTableBodyPylon"></tbody>
          </table>`);

        let tableBodyNode = $('#script_productionTableBodyPylon');
        let newTableBodyText = "";

        let pylonProducts = Object.values(RitualManager.Productions);

        for (let i = 0; i < pylonProducts.length; i++) {
            let production = pylonProducts[i];
            newTableBodyText += `<tr><td id="script_pylon_${production.id}" style="width:55%"></td><td style="width:20%"></td><td style="width:25%"></td></tr>`;
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other productions settings rows
        for (let i = 0; i < pylonProducts.length; i++) {
            let production = pylonProducts[i];
            let productionElement = $('#script_pylon_' + production.id);

            productionElement.append(buildStandartLabel(game.loc(`modal_pylon_spell_${production.id}`)));

            productionElement = productionElement.next();
            productionElement.append(buildStandartSettingsInput(production, "spell_w_" + production.id, "weighting"));
        }
    }

    function buildJobSettings() {
        let sectionId = "job";
        let sectionName = "Job";

        let resetFunction = function() {
            resetJobSettings();
            resetJobState();
            updateSettingsFromState();
            updateJobSettingsContent();
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateJobSettingsContent);
    }

    function updateJobSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_jobContent');
        currentNode.empty().off("*");

        addSettingsToggle(currentNode, "jobSetDefault", "Set default job", "Automatically sets the default job in order of Quarry Worker -> Lumberjack -> Crystal Miner -> Scavenger -> Hunter -> Farmer");
        addSettingsNumber(currentNode, "jobLumberWeighting", "Final Lumberjack Weighting", "AFTER allocating breakpoints this weighting will be used to split lumberjacks, quarry workers, crystal miners and scavengers");
        addSettingsNumber(currentNode, "jobQuarryWeighting", "Final Quarry Worker Weighting", "AFTER allocating breakpoints this weighting will be used to split lumberjacks, quarry workers, crystal miners and scavengers");
        addSettingsNumber(currentNode, "jobCrystalWeighting", "Final Crystal Miner Weighting", "AFTER allocating breakpoints this weighting will be used to split lumberjacks, quarry workers, crystal miners and scavengers");
        addSettingsNumber(currentNode, "jobScavengerWeighting", "Final Scavenger Weighting", "AFTER allocating breakpoints this weighting will be used to split lumberjacks, quarry workers, crystal miners and scavengers");
        addSettingsToggle(currentNode, "jobDisableMiners", "Disable miners in Andromeda", "Disable Miners and Coal Miners after reaching Andromeda");
        addSettingsToggle(currentNode, "jobDisableCraftsmans", "Craft manually when possible", "Disable non-Scarletite crafters when manual craft is allowed");

        currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:35%">Job</th>
              <th class="has-text-warning" style="width:20%">1st Pass Max</th>
              <th class="has-text-warning" style="width:20%">2nd Pass Max</th>
              <th class="has-text-warning" style="width:20%">Final Max</th>
              <th style="width:5%"></th>
            </tr>
            <tbody id="script_jobTableBody"></tbody>
          </table>`);

        let tableBodyNode = $('#script_jobTableBody');
        let newTableBodyText = "";

        for (let i = 0; i < JobManager.priorityList.length; i++) {
            const job = JobManager.priorityList[i];
            let classAttribute = (job === jobs.Farmer || job === jobs.Hunter || job === jobs.Unemployed) ? ' class="unsortable"' : ' class="script-draggable"';
            newTableBodyText += `<tr value="${job._originalId}"${classAttribute}><td id="script_${job._originalId}" style="width:35%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:5%"><span class="script-lastcolumn"></span></td></tr>`;
        }
        tableBodyNode.append($(newTableBodyText));

        for (let i = 0; i < JobManager.priorityList.length; i++) {
            const job = JobManager.priorityList[i];
            let jobElement = $('#script_' + job._originalId);

            var toggle = buildJobSettingsToggle(job);
            jobElement.append(toggle);

            jobElement = jobElement.next();
            jobElement.append(buildJobSettingsInput(job, 1));
            jobElement = jobElement.next();
            jobElement.append(buildJobSettingsInput(job, 2));
            jobElement = jobElement.next();
            jobElement.append(buildJobSettingsInput(job, 3));
        }

        $('#script_jobTableBody').sortable({
            items: "tr:not(.unsortable)",
            helper: function(event, ui){
                let clone = $(ui).clone();
                clone.css('position','absolute');
                return clone.get(0);
            },
            update: function() {
                let jobIds = $('#script_jobTableBody').sortable('toArray', {attribute: 'value'});

                for (let i = 0; i < jobIds.length; i++) {
                    // Job has been dragged... Update all job priorities
                    JobManager.priorityList.find(job => job._originalId === jobIds[i]).priority = i + 3; // farmers, hunters, and unemployed is always on top
                }

                JobManager.sortByPriority();
                updateSettingsFromState();
            },
        });

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildJobSettingsToggle(job) {
        let checked = job.autoJobEnabled ? " checked" : "";
        let color = job === jobs.Unemployed ? 'warning' : job instanceof CraftingJob ? 'danger' : job.isUnlimited() ? 'info' : 'advanced';
        let toggle = $('<label tabindex="0" class="switch" style="margin-top: 4px; margin-left: 10px;"><input type="checkbox"' + checked + '> <span class="check" style="height:5px; max-width:15px"></span><span class="has-text-' + color + '" style="margin-left: 20px;">' + job._originalName + '</span></label>');

        toggle.on('change', function(e) {
            let input = e.currentTarget.children[0];
            job.autoJobEnabled = input.checked;
            updateSettingsFromState();
            //console.log(job._originalName + " changed state to " + state);
        });

        return toggle;
    }

    function buildJobSettingsInput(job, breakpoint) {
        if (job === jobs.Farmer || job === jobs.Hunter || job instanceof CraftingJob || (job !== jobs.Unemployed && breakpoint === 3 && job.isUnlimited())) {
            let span = $('<span>Managed</span>');
            return span;
        }

        let jobBreakpointTextbox = $('<input type="text" class="input is-small" style="height: 25px; width:100%;"/>');
        jobBreakpointTextbox.val(settings["job_b" + breakpoint + "_" + job._originalId]);

        jobBreakpointTextbox.on('change', function() {
            let employees = getRealNumber(jobBreakpointTextbox.val());
            if (!isNaN(employees)) {
                //console.log('Setting job breakpoint ' + breakpoint + ' for job ' + job._originalName + ' to be ' + employees);
                job.breakpoints[breakpoint - 1] = employees;
                updateSettingsFromState();
            }
            jobBreakpointTextbox.val(settings["job_b" + breakpoint + "_" + job._originalId]);
        });

        return jobBreakpointTextbox;
    }

    function buildWeightingSettings() {
        let sectionId = "weighting";
        let sectionName = "AutoBuild Weighting";

        let resetFunction = function() {
            resetWeightingSettings();
            updateSettingsFromState();
            updateWeightingSettingsContent();
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateWeightingSettingsContent);
    }

    function updateWeightingSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_weightingContent');
        currentNode.empty().off("*");

        currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:30%">Target</th>
              <th class="has-text-warning" style="width:60%">Condition</th>
              <th class="has-text-warning" style="width:10%">Multiplier</th>
            </tr>
            <tbody id="script_weightingTableBody"></tbody>
          </table>`);

        let tableBodyNode = $('#script_weightingTableBody');

        // TODO: Make rules fully customizable? Like, eval() user's conditions, or configure them in some fancy gui.
        addWeightingRule(tableBodyNode, "Any", "New building", "buildingWeightingNew");
        addWeightingRule(tableBodyNode, "Powered building", "Low available energy", "buildingWeightingUnderpowered");
        addWeightingRule(tableBodyNode, "Power plant", "Low available energy", "buildingWeightingNeedfulPowerPlant");
        addWeightingRule(tableBodyNode, "Power plant", "Producing more energy than required", "buildingWeightingUselessPowerPlant");
        addWeightingRule(tableBodyNode, "Knowledge storage", "Have unlocked unafforable researches", "buildingWeightingNeedfulKnowledge");
        addWeightingRule(tableBodyNode, "Knowledge storage", "All unlocked researches already affordable", "buildingWeightingUselessKnowledge");
        addWeightingRule(tableBodyNode, "Building with state (city)", "Some instances of this building are not working", "buildingWeightingNonOperatingCity");
        addWeightingRule(tableBodyNode, "Building with state (space)", "Some instances of this building are not working", "buildingWeightingNonOperating");
        addWeightingRule(tableBodyNode, "Building with consumption", "Missing consumables to operate", "buildingWeightingMissingSupply");
        addWeightingRule(tableBodyNode, "Support consumer", "Missing support to operate", "buildingWeightingMissingSupport");
        addWeightingRule(tableBodyNode, "Support provider", "Provided support not currently needed", "buildingWeightingUselessSupport");
        addWeightingRule(tableBodyNode, "All fuel depots", "Missing Oil or Helium for techs and missions", "buildingWeightingMissingFuel");
        addWeightingRule(tableBodyNode, "Not housing, barrack, or knowledge building", "MAD prestige enabled, and affordable", "buildingWeightingMADUseless");
        addWeightingRule(tableBodyNode, "Mass Ejector", "Existed ejectors not fully utilized", "buildingWeightingUnusedEjectors");
        addWeightingRule(tableBodyNode, "Freight Yard, Container Port", "Have unused crates or containers", "buildingWeightingCrateUseless");
        addWeightingRule(tableBodyNode, "Horseshoes", "No more Horseshoes needed", "buildingWeightingHorseshoeUseless");
        addWeightingRule(tableBodyNode, "Meditation Chamber", "No more Meditation Space needed", "buildingWeightingZenUseless");
        addWeightingRule(tableBodyNode, "Gate Turret", "Gate demons fully supressed", "buildingWeightingGateTurret");
        addWeightingRule(tableBodyNode, "Warehouses, Garage, Cargo Yard", "Need more storage", "buildingWeightingNeedStorage");

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function addWeightingRule(table, targetName, conditionDesc, settingName){
        let ruleNode = $(`
          <tr>
            <td style="width:30%"><span class="has-text-info">${targetName}</span></td>
            <td style="width:60%"><span class="has-text-info">${conditionDesc}</span></td>
            <td style="width:10%"><input type="text" class="input is-small" style="height: 25px; width:100%;"/></td>
          </tr>`);

        let weightInput = ruleNode.find('input');
        weightInput.val(settings[settingName]);
        weightInput.on('change', function() {
            let parsedValue = getRealNumber(this.value);
            if (!isNaN(parsedValue)) {
                settings[settingName] = parsedValue;
                updateSettingsFromState();
            }
            weightInput.val(settings[settingName]);
        });

        table.append(ruleNode);
    }

    function buildBuildingSettings() {
        let sectionId = "building";
        let sectionName = "Building";

        let resetFunction = function() {
            resetBuildingSettings();
            resetBuildingState();
            updateSettingsFromState();
            updateBuildingSettingsContent();
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateBuildingSettingsContent);
    }

    function updateBuildingSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_buildingContent');
        currentNode.empty().off("*");

        addSettingsToggle(currentNode, "buildingBuildIfStorageFull", "Ignore weighting and build if storage is full", "Ignore weighting and immediately construct building if it uses any capped resource, preventing wasting them by overflowing. Weight still need to be positive(above zero) for this to happen.");
        addSettingsToggle(currentNode, "buildingsIgnoreZeroRate", "Do not wait for resources without income", "Weighting checks will ignore resources without positive income(craftables, inactive factory goods, etc), buildings with such resources will not delay other buildings.");
        addSettingsNumber(currentNode, "buildingTowerSuppression", "Minimum suppression for Towers", "East Tower and West Tower won't be built until minimum suppression is reached");

        let shrineOptions = [{val: "any", label: "Any", hint: "Build any Shrines, whenever have resources for it"},
                             {val: "equally", label: "Equally", hint: "Build all Shrines equally"},
                             {val: "morale", label: "Morale", hint: "Build only Morale Shrines"},
                             {val: "metal", label: "Metal", hint: "Build only Metal Shrines"},
                             {val: "know", label: "Knowledge", hint: "Build only Knowledge Shrines"},
                             {val: "tax", label: "Tax", hint: "Build only Tax Shrines"}];
        addSettingsSelect(currentNode, "buildingShrineType", "Magnificent Shrine", "Auto Build shrines only at moons of chosen shrine", shrineOptions);

        currentNode.append(`
          <div><input id="script_buildingSearch" class="script-searchsettings" type="text" placeholder="Search for buildings..."></div>
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:35%">Building</th>
              <th class="has-text-warning" style="width:15%">Auto Build</th>
              <th class="has-text-warning" style="width:15%">Max Build</th>
              <th class="has-text-warning" style="width:15%">Weighting</th>
              <th class="has-text-warning" style="width:20%" title="First toggle enables basic automation based on priority, power, support, and consumption. Second enables logic made specially for particlular building, their effects are different, but generally it tries to behave smarter than just staying enabled all the time.">Auto Power</th>
            </tr>
            <tbody id="script_buildingTableBody"></tbody>
          </table>`);

        let tableBodyNode = $('#script_buildingTableBody');

        $("#script_buildingSearch").on("keyup", filterBuildingSettingsTable); // Add building filter

        // Add in a first row for switching "All"
        let newTableBodyText = '<tr value="All" class="unsortable"><td id="script_bldallToggle" style="width:35%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:20%"></td></tr>';

        for (let i = 0; i < BuildingManager.priorityList.length; i++) {
            let building = BuildingManager.priorityList[i];
            newTableBodyText += `<tr value="${building._vueBinding}" class="script-draggable"><td id="script_${building._vueBinding}" style="width:35%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:20%"></td></tr>`;
        }
        tableBodyNode.append($(newTableBodyText));

        // Build special "All Buildings" top row
        let buildingElement = $('#script_bldallToggle');
        buildingElement.append('<span class="has-text-warning" style="margin-left: 20px;">All Buildings</span>');

        // enabled column
        buildingElement = buildingElement.next();
        buildingElement.append(buildAllBuildingEnabledSettingsToggle(BuildingManager.priorityList));

        // state column
        buildingElement = buildingElement.next().next().next();
        buildingElement.append(buildAllBuildingStateSettingsToggle(BuildingManager.priorityList));

        // Build all other buildings settings rows
        for (let i = 0; i < BuildingManager.priorityList.length; i++) {
            let building = BuildingManager.priorityList[i];
            let buildingElement = $('#script_' + building._vueBinding);

            buildingElement.append(buildBuildingLabel(building));

            buildingElement = buildingElement.next();
            buildingElement.append(buildStandartSettingsToggle(building, "autoBuildEnabled", "script_bat2_" + building._vueBinding, "script_bat1_" + building._vueBinding));

            buildingElement = buildingElement.next();
            buildingElement.append(buildStandartSettingsInput(building, "bld_m_" + building._vueBinding, "_autoMax"));

            buildingElement = buildingElement.next();
            buildingElement.append(buildStandartSettingsInput(building, "bld_w_" + building._vueBinding, "_weighting"));

            buildingElement = buildingElement.next();
            buildingElement.append(buildBuildingStateSettingsToggle(building));
        }

        $('#script_buildingTableBody').sortable({
            items: "tr:not(.unsortable)",
            helper: function(event, ui){
                let clone = $(ui).clone();
                clone.css('position','absolute');
                return clone.get(0);
            },
            update: function() {
                let buildingElements = $('#script_buildingTableBody').sortable('toArray', {attribute: 'value'});

                for (let i = 0; i < buildingElements.length; i++) {
                    // Building has been dragged... Update all building priorities
                    if (buildingElements[i] !== "All") {
                        BuildingManager.priorityList.find(building => building._vueBinding === buildingElements[i]).priority = i - 1;
                    }
                }

                BuildingManager.sortByPriority();
                updateSettingsFromState();
            },
        });

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function filterBuildingSettingsTable() {
        // Declare variables
        let filter = document.getElementById("script_buildingSearch").value.toUpperCase();
        let trs = document.getElementById("script_buildingTableBody").getElementsByTagName("tr");

        let filterChecker = null;
        let reg = filter.match(/^(.+)(<=|>=|===|==|<|>|!==|!=)(.+)$/);
        if (reg?.length === 4) {
            let buildingValue = null;
            switch (reg[1].trim()) {
                case "BUILD":
                case "AUTOBUILD":
                    buildingValue = (b) => b.autoBuildEnabled;
                    break;
                case "POWER":
                case "AUTOPOWER":
                    buildingValue = (b) => b.autoStateEnabled;
                    break;
                case "WEIGHT":
                case "WEIGHTING":
                    buildingValue = (b) => b._weighting;
                    break;
                case "MAX":
                case "MAXBUILD":
                    buildingValue = (b) => b._autoMax;
                    break;
                case "POWER":
                case "POWERED":
                    buildingValue = (b) => b.powered;
                    break;
                case "KNOW":
                case "KNOWLEDGE":
                    buildingValue = (b) => b.is.knowledge;
                    break;
                default: // Cost check, get resource quantity by name
                    buildingValue = (b) => b.resourceRequirements.find(req => req.resource.title.toUpperCase().indexOf(reg[1].trim()) > -1)?.quantity ?? 0;
            }
            let testValue = null;
            switch (reg[3].trim()) {
                case "ON":
                case "TRUE":
                    testValue = true;
                    break;
                case "OFF":
                case "FALSE":
                    testValue = false;
                    break;
                default:
                    testValue = getRealNumber(reg[3].trim());
                    break;
            }
            filterChecker = (building) => eval(`${buildingValue(building)} ${reg[2]} ${testValue}`);

        }

        // Loop through all table rows, and hide those who don't match the search query
        for (let i = 0; i < trs.length; i++) {
            let td = trs[i].getElementsByTagName("td")[0];
            if (td) {
                if (filterChecker) {
                    let building = buildingIds[td.id.match(/^script_(.*)$/)[1]];
                    if (building && filterChecker(building)) {
                        trs[i].style.display = "";
                    } else {
                        trs[i].style.display = "none";
                    }
                } else if (td.textContent.toUpperCase().indexOf(filter) > -1) {
                    trs[i].style.display = "";
                } else {
                    trs[i].style.display = "none";
                }
            }
        }

        let content = document.querySelector('#script_buildingSettings .script-content');
        content.style.height = null;
        content.style.height = content.offsetHeight + "px"
    }

    function buildBuildingLabel(building) {
        let color = "has-text-info";
        if (building._tab === "space" || building._tab === "starDock") {
            color = "has-text-danger";
        } else if (building._tab === "galaxy") {
            color = "has-text-advanced";
        } else if (building._tab === "interstellar") {
            color = "has-text-special";
        } else if (building._tab === "portal") {
            color = "has-text-warning";
        }

        return $(`<span class="${color}">${building.name}</span>`);
    }

    function buildAllBuildingEnabledSettingsToggle(buildings) {
        let checked = settings.buildingEnabledAll ? " checked" : "";
        let toggle = $('<label tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;"><input type="checkbox"' + checked + '> <span class="check" style="height:5px; max-width:15px"></span><span style="margin-left: 20px;"></span></label>');

        toggle.on('change', function(e) {
            let input = e.currentTarget.children[0];
            let state = input.checked;

            settings.buildingEnabledAll = state;

            for (let i = 0; i < buildings.length; i++) {
                buildings[i].autoBuildEnabled = state;
            }

            let toggles = document.querySelectorAll('[id^="script_bat"] input');

            for (let i = 0; i < toggles.length; i++) {
                toggles[i].checked = state;
            }

            updateSettingsFromState();
            //console.log(building.name + " changed enabled to " + state);
        });

        return toggle;
    }

    function buildBuildingStateSettingsToggle(building) {
        let stateElement = $('<div></div>');

        if (building.isSwitchable()) {
            $(`<label id=script_bld_s_${building._vueBinding} tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;">
                 <input type="checkbox" ${building.autoStateEnabled ? "checked" : ""}>
                 <span class="check" style="height:5px; max-width:15px"></span><span style="margin-left: 20px;"></span>
               </label>`)
            .on('change', 'input', function(event) {
                building.autoStateEnabled = event.currentTarget.checked;
                updateSettingsFromState();
            }).appendTo(stateElement);
        }

        if (building.is.smart) {
            $(`<label id=script_bld_s2_${building._vueBinding} tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 35px;">
                 <input type="checkbox" ${building.autoStateSmart ? "checked" : ""}>
                 <span class="check" style="height:5px; max-width:15px"></span><span style="margin-left: 20px;"></span>
               </label>`)
            .on('change', 'input', function(event) {
                let state = event.currentTarget.checked;

                let set = linkedBuildings.find(set => set.includes(building));
                if (set) {
                    set.forEach(building => {
                        building.autoStateSmart = state;
                        document.querySelector(`#script_bld_s2_${building._vueBinding} input`).checked = state;
                    });
                } else {
                    building.autoStateSmart = state;
                }

                updateSettingsFromState();
            }).appendTo(stateElement);
        }

        stateElement.append($(`<span class="script-lastcolumn"></span>`));

        return stateElement;
    }

    function buildAllBuildingStateSettingsToggle(buildings) {
        let checked = settings.buildingStateAll ? " checked" : "";
        let toggle = $('<label tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;"><input type="checkbox"' + checked + '> <span class="check" style="height:5px; max-width:15px"></span><span style="margin-left: 20px;"></span></label>');

        toggle.on('change', function(e) {
            let input = e.currentTarget.children[0];
            let state = input.checked;

            settings.buildingStateAll = state;

            for (let i = 0; i < buildings.length; i++) {
                buildings[i].autoStateEnabled = state;
            }

            let toggles = document.querySelectorAll('[id^="script_bld_s_"] input');

            for (let i = 0; i < toggles.length; i++) {
                toggles[i].checked = state;
            }

            updateSettingsFromState();
            //console.log(building.name + " changed state to " + state);
        });

        return toggle;
    }

    function buildProjectSettings() {
        let sectionId = "project";
        let sectionName = "A.R.P.A.";

        let resetFunction = function() {
            resetProjectSettings();
            resetProjectState();
            updateSettingsFromState();
            updateProjectSettingsContent();
        };

        buildSettingsSection(sectionId, sectionName, resetFunction, updateProjectSettingsContent);
    }

    function updateProjectSettingsContent() {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $('#script_projectContent');
        currentNode.empty().off("*");

        addSettingsToggle(currentNode, "arpaScaleWeighting", "Scale weighting with progress", "Projects weighting scales  with current progress, making script more eager to spend resources on finishing nearly constructed projects.");
        addSettingsNumber(currentNode, "arpaStep", "Preferred progress step", "Projects will be weighted and build in this steps. Increasing number can speed up constructing. Step will be adjusted down when preferred step above remaining amount, or surpass storage caps. Weightings below will be multiplied by current step. Projects builded by triggers will always have maximum possible step.");

        currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:25%">Project</th>
              <th class="has-text-warning" style="width:25%">Auto Build</th>
              <th class="has-text-warning" style="width:25%">Max Build</th>
              <th class="has-text-warning" style="width:25%">Weighting</th>
            </tr>
            <tbody id="script_projectTableBody"></tbody>
          </table>`);

        let tableBodyNode = $('#script_projectTableBody');
        let newTableBodyText = "";

        for (let i = 0; i < ProjectManager.priorityList.length; i++) {
            const project = ProjectManager.priorityList[i];
            newTableBodyText += `<tr value="${project.id}" class="script-draggable"><td id="script_${project.id}" style="width:25%"></td><td style="width:25%"></td><td style="width:25%"></td><td style="width:25%"></td><td style="width:25%"></td></tr>`;
        }
        tableBodyNode.append($(newTableBodyText));

        // Build all other projects settings rows
        for (let i = 0; i < ProjectManager.priorityList.length; i++) {
            const project = ProjectManager.priorityList[i];
            let projectElement = $('#script_' + project.id);

            projectElement.append(buildStandartLabel(project.name));

            projectElement = projectElement.next();
            projectElement.append(buildStandartSettingsToggle(project, "autoBuildEnabled", "script_arpa2_" + project.id, "script_arpa1_" + project.id));

            projectElement = projectElement.next();
            projectElement.append(buildStandartSettingsInput(project, "arpa_m_" + project.id, "_autoMax"));

            projectElement = projectElement.next();
            projectElement.append(buildStandartSettingsInput(project, "arpa_w_" + project.id, "_weighting"));

        }

        $('#script_projectTableBody').sortable({
            items: "tr:not(.unsortable)",
            helper: function(event, ui){
                let clone = $(ui).clone();
                clone.css('position','absolute');
                return clone.get(0);
            },
            update: function() {
                let projectIds = $('#script_projectTableBody').sortable('toArray', {attribute: 'value'});

                for (let i = 0; i < projectIds.length; i++) {
                    // Project has been dragged... Update all project priorities
                    ProjectManager.priorityList.find(project => project.id === projectIds[i]).priority = i;
                }

                ProjectManager.sortByPriority();
                updateSettingsFromState();
            },
        });

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function buildLoggingSettings(parentNode, secondaryPrefix) {
        let sectionId = "logging";
        let sectionName = "Logging";

        let resetFunction = function() {
            resetLoggingSettings();
            updateSettingsFromState();
            updateLoggingSettingsContent(secondaryPrefix);
        };

        buildSettingsSection2(parentNode, secondaryPrefix, sectionId, sectionName, resetFunction, updateLoggingSettingsContent);
    }

    function updateLoggingSettingsContent(secondaryPrefix) {
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        let currentNode = $(`#script_${secondaryPrefix}loggingContent`);
        currentNode.empty().off("*");

        addSettingsHeader1(currentNode, "Script Messages");
        addSettingsToggle(currentNode, "logEnabled", "Enable logging", "Master switch to enable logging of script actions in the game message queue");
        Object.values(GameLog.Types).forEach(log => addSettingsToggle(currentNode, log.settingKey, log.name, `If logging is enabled then logs ${log.name} actions`));

        addSettingsHeader1(currentNode, "Game Messages");
        let stringsUrl = `strings/strings${game.global.settings.locale === "en-US" ? "" : "." + game.global.settings.locale}.json`
        currentNode.append(`
          <div>
            <span>List of message IDs to filter, all game messages can be found <a href="${stringsUrl}" target="_blank">here</a>.</span><br>
            <textarea id="script_logFilter" class="textarea" style="margin-top: 4px;">${settings.logFilter}</textarea>
          </div>`);

        // Settings textarea
        $("#script_logFilter").on('change', function() {
            settings.logFilter = this.value;
            buildFilterRegExp();
            this.value = settings.logFilter;
            updateSettingsFromState();
        });

        document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
    }

    function createQuickOptions(node, optionsElementId, optionsDisplayName, buildOptionsFunction) {
        let optionsDiv = $(`<div style="cursor: pointer;" id="${optionsElementId}">${optionsDisplayName} Options</div>`);
        node.append(optionsDiv);

        addOptionUI(optionsElementId + "_btn", `#${optionsElementId}`, optionsDisplayName, buildOptionsFunction);
        addOptionUiClickHandler(optionsDiv, optionsDisplayName, buildOptionsFunction);
    }

    function createSettingToggle(node, name, title, enabledCallBack, disabledCallBack) {
        let toggle = $(`<label id="${name}" tabindex="0" class="switch" title="${title}"><input type="checkbox"${settings[name] ? " checked" : ""}/> <span class="check"></span><span>${name}</span></label></br>`);
        node.append(toggle);

        if (settings[name] && enabledCallBack) {
            enabledCallBack();
        }

        toggle.on('change', function(e) {
            settings[name] = e.currentTarget.children[0].checked;
            updateSettingsFromState();
            if (settings[name] && enabledCallBack) {
                enabledCallBack();
            }
            if (!settings[name] && disabledCallBack) {
                disabledCallBack();
            }
        });
    }

    function updateOptionsUI() {
        // City district outskirts
        // if (document.getElementById("s-city-dist-outskirts-options") === null) {
        //     let sectionNode = $('#city-dist-outskirts h3');

        // Build secondary options buttons if they don't currently exist
        addOptionUI("s-government-options", "#government ul", "Government", buildGovernmentSettings);
        addOptionUI("s-foreign-options", "#garrison div h2", "Foreign Affairs", buildWarSettings);
        addOptionUI("s-foreign-options2", "#c_garrison div h2", "Foreign Affairs", buildWarSettings);
        addOptionUI("s-hell-options", "#gFort div h3", "Hell", buildHellSettings);
        addOptionUI("s-hell-options2", "#prtl_fortress div h3", "Hell", buildHellSettings);
    }

    function addOptionUI(optionsId, querySelectorText, modalTitle, buildOptionsFunction) {
        if (document.getElementById(optionsId) !== null) { return; } // We've already built the options UI

        let sectionNode = $(querySelectorText);

        if (sectionNode.length === 0) { return; } // The node that we want to add it to doesn't exist yet

        let newOptionNode = $(`<span id="${optionsId}" class="s-options-button has-text-success" style="margin-right:0px">+</span>`);
        sectionNode.prepend(newOptionNode);
        addOptionUiClickHandler(newOptionNode, modalTitle, buildOptionsFunction);
    }

    function addOptionUiClickHandler(optionNode, modalTitle, buildOptionsFunction) {
        optionNode.on('click', function() {
            // Build content
            let modalHeader = $('#scriptModalHeader');
            modalHeader.empty().off("*");
            modalHeader.append(`<span>${modalTitle}</span>`);

            let modalBody = $('#scriptModalBody');
            modalBody.empty().off("*");
            buildOptionsFunction(modalBody, "c_");

            // Show modal
            let modal = document.getElementById("scriptModal");
            $("html").css('overflow', 'hidden');
            modal.style.display = "block";
        });
    }

    function createOptionsModal() {
        if (document.getElementById("scriptModal") !== null) {
            return;
        }

        // Append the script modal to the document
        $(document.body).append(`
          <div id="scriptModal" class="script-modal">
            <span id="scriptModalClose" class="script-modal-close">&times;</span>
            <div class="script-modal-content">
              <div id="scriptModalHeader" class="script-modal-header has-text-warning">
                <p>You should never see this modal header...</p>
              </div>
              <div id="scriptModalBody" class="script-modal-body">
                <p>You should never see this modal body...</p>
              </div>
            </div>
          </div>`);

        // Add the script modal close button action
        $('#scriptModalClose').on("click", function() {
            $("#scriptModal").css('display', 'none');
            $("html").css('overflow-y', 'scroll');
        });

        // If the user clicks outside the modal then close it
        $(window).on("click", function(event) {
            if (event.target.id === "scriptModal") {
                $("#scriptModal").css('display', 'none');
                $("html").css('overflow-y', 'scroll');
            }
        });
    }

    function updateUI() {
        let resetScrollPositionRequired = false;
        let currentScrollPosition = document.documentElement.scrollTop || document.body.scrollTop;

        createOptionsModal();
        updateOptionsUI();

        let scriptNode = $('#autoScriptContainer');
        if (scriptNode.length === 0) {
            scriptNode = $('<div id="autoScriptContainer"></div>');
            $('#resources').append(scriptNode);
            resetScrollPositionRequired = true;

            scriptNode.append('<label id="autoScriptInfo">More script options available in Settings tab</label></br>');

            createSettingToggle(scriptNode, 'masterScriptToggle', 'Stop taking any actions on behalf of the player.');

            // Dirty performance patch. Settings have a lot of elements, and they stress JQuery selectors way too much. This toggle allow to remove them from DOM completely, when they aren't needed.
            // It doesn't have huge impact anymore, after all script and game changes, but still won't hurt to have an option to increase performance a tiny bit more
            createSettingToggle(scriptNode, 'showSettings', 'You can disable rendering of settings UI once you\'ve done with configuring script, if you experiencing performance issues. It can help a little.', buildScriptSettings, removeScriptSettings);

            createSettingToggle(scriptNode, 'autoEvolution', 'Runs through the evolution part of the game through to founding a settlement. In Auto Achievements mode will target races that you don\'t have extinction\\greatness achievements for yet.');
            createSettingToggle(scriptNode, 'autoFight', 'Sends troops to battle whenever Soldiers are full and there are no wounded. Adds to your offensive battalion and switches attack type when offensive rating is greater than the rating cutoff for that attack type.');
            createSettingToggle(scriptNode, 'autoHell', 'Sends soldiers to hell and sends them out on patrols. Adjusts maximum number of powered attractors based on threat.');
            createSettingToggle(scriptNode, 'autoMech', 'Builds most effective large mechs for current spire floor. Least effective will be scrapped to make room for new ones.', startMechObserver, stopMechObserver);
            createSettingToggle(scriptNode, 'autoFleet', 'Manages Andromeda fleet to supress piracy');
            createSettingToggle(scriptNode, 'autoTax', 'Adjusts tax rates if your current morale is greater than your maximum allowed morale. Will always keep morale above 100%.');
            createSettingToggle(scriptNode, 'autoCraft', 'Automatically produce craftable resources, thresholds when it happens depends on current demands and stocks.', createCraftToggles, removeCraftToggles);
            createSettingToggle(scriptNode, 'autoBuild', 'Construct buildings based on their weightings(user configured), and various rules(e.g. it won\'t build building which have no support to run)', createBuildingToggles, removeBuildingToggles);
            createSettingToggle(scriptNode, 'autoPower', 'Manages power based on a priority order of buildings. Also disables currently useless buildings to save up resources.');
            createSettingToggle(scriptNode, 'autoStorage', 'Assigns crates and containers to resources needed for buildings enabled for Auto Build, queued buildings, researches, and enabled projects', createStorageToggles, removeStorageToggles);
            createSettingToggle(scriptNode, 'autoMarket', 'Allows for automatic buying and selling of resources once specific ratios are met. Also allows setting up trade routes until a minimum specified money per second is reached. The will trade in and out in an attempt to maximise your trade routes.', createMarketToggles, removeMarketToggles);
            createSettingToggle(scriptNode, 'autoGalaxyMarket', 'Manages galaxy trade routes');
            createSettingToggle(scriptNode, 'autoResearch', 'Performs research when minimum requirements are met.');
            createSettingToggle(scriptNode, 'autoARPA', 'Builds ARPA projects if user enables them to be built.', createArpaToggles, removeArpaToggles);
            createSettingToggle(scriptNode, 'autoJobs', 'Assigns jobs in a priority order with multiple breakpoints. Starts with a few jobs each and works up from there. Will try to put a minimum number on lumber / stone then fill up capped jobs first.');
            createSettingToggle(scriptNode, 'autoCraftsmen', 'With this option autoJobs will also manage craftsmens.');
            createSettingToggle(scriptNode, 'autoPylon', 'Manages pylon rituals');
            createSettingToggle(scriptNode, 'autoQuarry', 'Manages rock quarry stone to chrysotile ratio for smoldering races');
            createSettingToggle(scriptNode, 'autoSmelter', 'Manages smelter fuel and production.');
            createSettingToggle(scriptNode, 'autoFactory', 'Manages factory production.');
            createSettingToggle(scriptNode, 'autoMiningDroid', 'Manages mining droid production.');
            createSettingToggle(scriptNode, 'autoGraphenePlant', 'Manages graphene plant. Not user configurable - just uses least demanded resource for fuel.');
            createSettingToggle(scriptNode, 'autoAssembleGene', 'Automatically assembles genes only when your knowledge is at max. Stops when DNA Sequencing is researched.');
            createSettingToggle(scriptNode, 'autoMinorTrait', 'Purchase minor traits using genes according to their weighting settings.');

            createQuickOptions(scriptNode, "s-quick-prestige-options", "Prestige", buildPrestigeSettings);

            if (showLogging) {
                createSettingToggle(scriptNode, 'autoLogging', 'autoLogging');

                scriptNode.append(`
                  <div id="ea-logging">
                    <div>Logging Type:</div>
                    <input type="text" class="input is-small" style="width:100%"/>
                    <a class="button is-dark is-small"><span>set</span></a>
                  </div>`);
                $("#ea-logging > input").val(loggingType);

                $("#ea-logging > a").on('mouseup', function() {
                   loggingType = $("#ea-logging > input").val();
                });
            }

            scriptNode.append('<a class="button is-dark is-small" id="bulk-sell"><span>Bulk Sell</span></a>');
            $("#bulk-sell").on('mouseup', function() {
                game.updateDebugData();
                updateScriptData();
                autoMarket(true, true);
            });

            scriptNode.append(`
              <div id="ea-settings">
                <div>Minimum money to keep :</div>
                <input type="text" class="input is-small" style="width:100%"/>
                <a class="button is-dark is-small" id="set-min-money"><span>Set</span></a>
                <a class="button is-dark is-small" id="set-min-percent" title="eg. 10 equals 10%"><span>Set %</span></a>
              </div>`);
            let minimumMoneyValue = settings.minimumMoney > 0 ? settings.minimumMoney : settings.minimumMoneyPercentage;
            $("#ea-settings > input").val(minimumMoneyValue);

            $("#set-min-money").on('click', function() {
                let minMoney = getRealNumber($("#ea-settings > input").val());
                if (!isNaN(minMoney)) {
                    settings.minimumMoney = minMoney;
                    settings.minimumMoneyPercentage = 0;
                    updateSettingsFromState();
                }
            });
            $("#set-min-percent").on('click', function() {
                let minMoneyPercent = getRealNumber($("#ea-settings > input").val());
                if (!isNaN(minMoneyPercent)) {
                    settings.minimumMoneyPercentage = minMoneyPercent;
                    settings.minimumMoney = 0;
                    updateSettingsFromState();
                }
            });
        }

        if (scriptNode.next().length) {
            resetScrollPositionRequired = true;
            scriptNode.parent().append(scriptNode);
        }

        if (settings.showSettings && $("#script_settings").length === 0) {
            buildScriptSettings();
        }
        if (settings.autoCraft && $('#resources .ea-craft-toggle').length === 0) {
            createCraftToggles();
        }
        // Building toggles added to different tabs, game can redraw just one tab, destroying toggles there, and we still have total number of toggles above zero; we'll remember amount of toggle, and redraw it when number differ from what we have in game
        let currentBuildingToggles = $('#mTabCivil .ea-building-toggle').length;
        if (settings.autoBuild && (currentBuildingToggles === 0 || currentBuildingToggles !== state.buildingToggles)) {
            createBuildingToggles();
        }
        if (settings.autoStorage && game.global.settings.showStorage && $('#resStorage .ea-storage-toggle').length === 0) {
            createStorageToggles();
        }
        if (settings.autoMarket && game.global.settings.showMarket && $('#market .ea-market-toggle').length === 0) {
            createMarketToggles();
        }
        if (settings.prestigeWhiteholeEjectEnabled && game.global.settings.showEjector && $('#resEjector .ea-eject-toggle').length === 0) {
            createEjectToggles();
        }
        if (settings.autoSupply && game.global.settings.showCargo && $('#resCargo .ea-supply-toggle').length === 0) {
            createSupplyToggles();
        }
        if (settings.autoARPA && game.global.settings.showGenetics && $('#arpaPhysics .ea-arpa-toggle').length === 0) {
            createArpaToggles();
        }

        if (settings.autoMech && game.global.settings.showMechLab && $('#mechList .ea-mech-info').length === 0) {
            startMechObserver();
        }

        // Soul Gems income rate
        if (resources.Soul_Gem.isUnlocked()) {
            if (resources.Soul_Gem.currentQuantity > state.soulGemLast) {
                state.soulGemIncomes.push({tick: state.scriptTick, gems: resources.Soul_Gem.currentQuantity - state.soulGemLast})
            }
            // Always override amount of gems, this way we're ignoring expenses, and only tracking incomes
            state.soulGemLast = resources.Soul_Gem.currentQuantity;
            let gems = 0;
            let i = state.soulGemIncomes.length;
            while (--i >= 0) {
                let income = state.soulGemIncomes[i];
                // Get all gems gained in last hour, or at least 10 last gems in any time frame, if rate is low
                if (state.scriptTick - income.tick > 3600 && gems > 10) {
                    break;
                } else {
                    gems += income.gems;
                }
            }
            // If loop was broken prematurely - clean up old records which we don't need anymore
            if (i >= 0) {
                state.soulGemIncomes = state.soulGemIncomes.splice(i+1);
            }
            let timePassed = state.scriptTick - state.soulGemIncomes[0].tick;
            let rate = gems / timePassed * 3600;
            // Apply game speed to sync with other incomes
            resources.Soul_Gem.rateOfChange = gems / timePassed * gameTicksPerSecond("mid");
            $("#resSoul_Gem span:eq(2)").text(`${getNiceNumber(rate)} /h`);
        }

        // Previous game stats
        if ($("#statsPanel .cstat").length === 1) {
            let backupString = win.LZString.decompressFromUTF16(localStorage.getItem('evolveBak'));
            if (backupString) {
                let oldStats = JSON.parse(backupString).stats;
                let statsData = {knowledge_spent: oldStats.know, starved_to_death: oldStats.starved, died_in_combat: oldStats.died, attacks_made: oldStats.attacks, game_days_played: oldStats.days};
                if (oldStats.dkills > 0) {
                    statsData.demons_kills = oldStats.dkills;
                }
                if (oldStats.sac > 0) {
                    statsData.sacrificed = oldStats.sac;
                }
                let statsString = `<div class="cstat"><span class="has-text-success">Previous Game</span></div>`;
                for (let [label, value] of Object.entries(statsData)) {
                    statsString += `<div><span class="has-text-warning">${game.loc("achieve_stats_" + label)}</span> ${value.toLocaleString()}</div>`;
                }
                $("#statsPanel").append(statsString);
            }
        }

        if (resetScrollPositionRequired) {
            // Leave the scroll position where it was before all our updates to the UI above
            document.documentElement.scrollTop = document.body.scrollTop = currentScrollPosition;
        }
    }

    function createMechInfo() {
        if (MechManager.initLab()) {
            removeMechInfo();
            $('#mechList .mechRow').each(function(index) {
                let mech = game.global.portal.mechbay.mechs[index];
                let stats = MechManager.getMechStats(mech);
                let rating = stats.power / MechManager.bestMech[mech.size].power;
                let info = mech.size === 'collector' ?
                  `${Math.round(rating*100)}%, ${getNiceNumber(stats.power*MechManager.collectorValue)} /s`:
                  `${Math.round(rating*100)}%, ${getNiceNumber(stats.power*100)}, ${getNiceNumber(stats.efficiency*100)}`;
                $(this).prepend(`<span class="ea-mech-info">${info} | </span>`);
            });
        }
    }

    function removeMechInfo() {
        $('#mechList .ea-mech-info').remove();
    }

    function startMechObserver() {
        stopMechObserver();

        createMechInfo();
        MechManager.mechObserver.observe(document.getElementById("mechLab"), {childList: true});
    }

    function stopMechObserver() {
        MechManager.mechObserver.disconnect();
        removeMechInfo();
    }

    function createArpaToggles() {
        removeArpaToggles();

        for (let i = 0; i < ProjectManager.priorityList.length; i++) {
            let project = ProjectManager.priorityList[i];
            let projectElement = $('#arpa' + project.id + ' .head');
            if (projectElement.length) {
                let toggle = $(`<label id="script_arpa1_${project.id}" tabindex="0" class="switch ea-arpa-toggle" style="position:relative; max-width:75px;margin-top: -36px;left:59%;float:left;"><input type="checkbox"${project.autoBuildEnabled ? " checked" : ""}> <span class="check" style="height:5px;"></span></label>`);
                projectElement.append(toggle);
                toggle.on('change', {entity: project, property: "autoBuildEnabled", sync: "script_arpa2_" + project.id}, toggleCallback);
            }
        }
    }

    function removeArpaToggles() {
        $('#arpaPhysics .ea-arpa-toggle').remove();
    }

    function createCraftToggles() {
        removeCraftToggles();

        for (let i = 0; i < state.craftableResourceList.length; i++) {
            let craftable = state.craftableResourceList[i];
            let craftableElement = $('#res' + craftable.id);
            if (craftableElement.length) {
                let toggle = $(`<label id="script_craft1_${craftable.id}" tabindex="0" class="switch ea-craft-toggle" style="position:absolute; max-width:75px;margin-top: 4px;left:30%;"><input type="checkbox"${craftable.autoCraftEnabled ? " checked" : ""}/> <span class="check" style="height:5px;"></span></label>`);
                craftableElement.append(toggle);
                toggle.on('change', {entity: craftable, property: "autoCraftEnabled", sync: "script_craft2_" + craftable.id}, toggleCallback);
            }
        }
    }

    function removeCraftToggles() {
        $('#resources .ea-craft-toggle').remove();
    }

    function createBuildingToggles() {
        removeBuildingToggles();

        for (let i = 0; i < BuildingManager.priorityList.length; i++) {
            let building = BuildingManager.priorityList[i];
            let buildingElement = $('#' + building._vueBinding);
            if (buildingElement.length) {
                let toggle = $(`<label id="script_bat1_${building._vueBinding}" tabindex="0" class="switch ea-building-toggle" style="position:absolute; margin-top: 24px;left:10%;"><input type="checkbox"${building.autoBuildEnabled ? " checked" : ""}/> <span class="check" style="height:5px; max-width:15px"></span></label>`);
                buildingElement.append(toggle);
                toggle.on('change', {entity: building, property: "autoBuildEnabled", sync: "script_bat2_" + building._vueBinding}, toggleCallback);
                state.buildingToggles++;
            }
        }
    }

    function removeBuildingToggles() {
        $('#mTabCivil .ea-building-toggle').remove();
        state.buildingToggles = 0;
    }

    function createEjectToggles() {
        removeEjectToggles();

        $('#eject').append('<span id="script_eject_top_row" style="margin-left: auto; margin-right: 0.2rem; float: right;" class="has-text-danger">Auto Eject</span>');
        for (let i = 0; i < resourcesByAtomicMass.length; i++) {
            let resource = resourcesByAtomicMass[i];
            let ejectElement = $('#eject' + resource.id);
            if (ejectElement.length) {
                let toggle = $(`<label id="script_eject1_${resource.id}" tabindex="0" title="Enable ejecting of this resource. When to eject is set in the Prestige Settings tab."  class="switch ea-eject-toggle" style="margin-left: auto; margin-right: 0.2rem;"><input type="checkbox"${resource.ejectEnabled ? " checked" : ""}> <span class="check" style="height:5px;"></span><span class="state"></span></label>`);
                ejectElement.append(toggle);
                toggle.on('change', {entity: resource, property: "ejectEnabled", sync: "script_eject2_" + resource.id}, toggleCallback);
            }
        }
    }

    function removeEjectToggles() {
        $('#resEjector .ea-eject-toggle').remove();
        $("#script_eject_top_row").remove();
    }

    function createSupplyToggles() {
        removeSupplyToggles();

        $('#spireSupply').append('<span id="script_supply_top_row" style="margin-left: auto; margin-right: 0.2rem; float: right;" class="has-text-danger">Auto Supply</span>');
        for (let i = 0; i < resourcesBySupplyValue.length; i++) {
            let resource = resourcesBySupplyValue[i];
            let supplyElement = $('#supply' + resource.id);
            if (supplyElement.length) {
                let toggle = $(`<label id="script_supply1_${resource.id}" tabindex="0" title="Enable supply of this resource."  class="switch ea-supply-toggle" style="margin-left: auto; margin-right: 0.2rem;"><input type="checkbox"${resource.supplyEnabled ? " checked" : ""}> <span class="check" style="height:5px;"></span><span class="state"></span></label>`);
                supplyElement.append(toggle);
                toggle.on('change', {entity: resource, property: "supplyEnabled", sync: "script_supply2_" + resource.id}, toggleCallback);
            }
        }
    }

    function removeSupplyToggles() {
        $('#resCargo .ea-supply-toggle').remove();
        $("#script_supply_top_row").remove();
    }

    function createMarketToggles() {
        removeMarketToggles();

        if (!game.global.race['no_trade']) {
            $("#market .market-item[id] .res").width("5rem");
            $("#market .market-item[id] .buy span").text("B");
            $("#market .market-item[id] .sell span").text("S");
            $("#market .market-item[id] .trade > :first-child").text("R");
            $("#market .market-item[id] .trade .zero").text("×");
        }

        $("#market-qty").after(`
          <div class="market-item vb" id="script_market_top_row" style="overflow:hidden">
            <span style="margin-left: auto; margin-right: 0.2rem; float:right;">
              ${!game.global.race['no_trade']?`
              <span class="has-text-success" style="width: 2.75rem; margin-right: 0.3em; display: inline-block; text-align: center;">Buy</span>
              <span class="has-text-danger" style="width: 2.75rem; margin-right: 0.3em; display: inline-block; text-align: center;">Sell</span>`:''}
              <span class="has-text-warning" style="width: 2.75rem; margin-right: 0.3em; display: inline-block; text-align: center;">In</span>
              <span class="has-text-warning" style="width: 2.75rem; display: inline-block; text-align: center;">Away</span>
            </span>
          </div>`);

        for (let resource of MarketManager.priorityList) {
            let marketElement = $('#market-' + resource.id);
            if (marketElement.length > 0) {
                let marketRow = $('<span class="ea-market-toggle" style="margin-left: auto; margin-right: 0.2rem; float:right;"></span>');

                if (!game.global.race['no_trade']) {
                    marketRow.append(
                      $(`<label id="script_buy1_${resource.id}" tabindex="0" title="Enable buying of this resource."  class="switch"><input type="checkbox"${resource.autoBuyEnabled ? " checked" : ""}> <span class="check" style="height:5px;"></span><span class="state"></span></label>`)
                        .on('change', {entity: resource, property: "autoBuyEnabled", sync: "script_buy2_" + resource.id}, toggleCallback),
                      $(`<label id="script_sell1_${resource.id}" tabindex="0" title="Enable selling of this resource."  class="switch"><input type="checkbox"${resource.autoSellEnabled ? " checked" : ""}> <span class="check" style="height:5px;"></span><span class="state"></span></label>`)
                        .on('change', {entity: resource, property: "autoSellEnabled", sync: "script_sell2_" + resource.id}, toggleCallback));
                }

                marketRow.append(
                  $(`<label id="script_tbuy1_${resource.id}" tabindex="0" title="Enable trading for this resource." class="switch"><input type="checkbox"${resource.autoTradeBuyEnabled ? " checked" : ""}> <span class="check" style="height:5px;"></span><span class="state"></span></label>`)
                    .on('change', {entity: resource, property: "autoTradeBuyEnabled", sync: "script_tbuy2_" + resource.id}, toggleCallback),
                  $(`<label id="script_tsell1_${resource.id}" tabindex="0" title="Enable trading this resource away." class="switch"><input type="checkbox"${resource.autoTradeSellEnabled ? " checked" : ""}> <span class="check" style="height:5px;"></span><span class="state"></span></label>`)
                    .on('change', {entity: resource, property: "autoTradeSellEnabled", sync: "script_tsell2_" + resource.id}, toggleCallback));

                marketRow.appendTo(marketElement);
            }
        }
    }

    function removeMarketToggles() {
        $('#market .ea-market-toggle').remove();
        $("#script_market_top_row").remove();

        if (!game.global.race['no_trade']) {
            $("#market .market-item[id] .res").width("7.5rem");
            $("#market .market-item[id] .buy span").text("BUY");
            $("#market .market-item[id] .sell span").text("SELL");
            $("#market .market-item[id] .trade > :first-child").text("Routes:");
            $("#market .market-item[id] .trade .zero").text("Cancel Routes");
        }
    }

    function createStorageToggles() {
        removeStorageToggles();

        $("#createHead").after(`
          <div class="market-item vb" id="script_storage_top_row" style="overflow:hidden">
            <span style="margin-left: auto; margin-right: 0.2rem; float:right;">
              <span class="has-text-warning" style="width: 2.75rem; margin-right: 0.3em; display: inline-block; text-align: center;">Auto</span>
              <span class="has-text-warning" style="width: 2.75rem; display: inline-block; text-align: center;">Over</span>
            </span>
          </div>`);

        for (let resource of StorageManager.priorityList) {
            let storageElement = $('#stack-' + resource.id);
            if (storageElement.length > 0) {
                $('<span class="ea-storage-toggle" style="margin-left: auto; margin-right: 0.2rem; float:right;"></span>')
                  .append(
                    $(`<label id="script_res_storage1_${resource.id}" tabindex="0" title="Enable storing of this resource." class="switch"><input type="checkbox"${resource.autoStorageEnabled ? " checked" : ""}> <span class="check" style="height:5px;"></span><span class="state"></span></label>`)
                      .on('change', {entity: resource, property: "autoStorageEnabled", sync: "script_res_storage2_" + resource.id}, toggleCallback),
                    $(`<label id="script_res_overflow1_${resource.id}" tabindex="0" title="Enable storing overflow of this resource." class="switch"><input type="checkbox"${resource.storeOverflow ? " checked" : ""}> <span class="check" style="height:5px;"></span><span class="state"></span></label>`)
                      .on('change', {entity: resource, property: "storeOverflow", sync: "script_res_overflow2_" + resource.id}, toggleCallback))
                  .appendTo(storageElement);
            }
        }
    }

    function removeStorageToggles() {
        $('#resStorage .ea-storage-toggle').remove();
        $("#script_storage_top_row").remove();
    }

    // Util functions
    // https://gist.github.com/axelpale/3118596
    function k_combinations(set, k) {
        if (k > set.length || k <= 0) {
            return [[]];
        }
        if (k == set.length) {
            return [set];
        }
        if (k == 1) {
            return set.map(i => [i]);
        }
        let combs = [];
        let tailcombs = [];
        for (let i = 0; i < set.length - k + 1; i++) {
            tailcombs = k_combinations(set.slice(i + 1), k - 1);
            for (let j = 0; j < tailcombs.length; j++) {
                combs.push([set[i], ...tailcombs[j]])
            }
        }
        return combs;
    }

    // https://stackoverflow.com/a/44012184
    function* cartesian(head, ...tail) {
        let remainder = tail.length > 0 ? cartesian(...tail) : [[]];
        for (let r of remainder) for (let h of head) yield [h, ...r];
    }

    function average(arr) {
        return arr.reduce((sum, val) => sum + val) / arr.length;
    }

    function getUnsuitedMod() {
        return !game.global.blood.unbound ? 0 : game.global.blood.unbound >= 4 ? 0.95 : game.global.blood.unbound >= 2 ? 0.9 : 0.8;
    }

    var baseDuration = {main: 250, mid: 1000, long: 500};
    function gameTicksPerSecond(type) {
        let ms = baseDuration[type];
        if (game.global.race['slow']) {
            ms *= 1.1;
        }
        if (game.global.race['hyper']) {
            ms *= 0.95;
        }
        if (game.global.settings.at > 0) {
            ms *= 0.5;
        }
        return 1000 / ms;
    }

    function getResourcesPerClick() {
        let amount = 1;
        if (game.global.race['strong']) {
            amount *= 5;
        }
        if (game.global.genes['enhance']) {
            amount *= 2;
        }
        return amount;
    }

    function getCostConflict(action) {
        for (let i = 0; i < state.queuedTargets.length; i++) {
            let otherObject = state.queuedTargets[i];
            if (otherObject instanceof Technology) {
                if (!settings.buildingsConflictRQueue) continue;
            } else if (otherObject instanceof Project){
                if (!settings.buildingsConflictPQueue) continue;
            } else {
                if (!settings.buildingsConflictQueue) continue;
            }

            let blockKnowledge = true;
            for (let j = 0; j < otherObject.resourceRequirements.length; j++) {
                let otherReq = otherObject.resourceRequirements[j];
                if (otherReq.resource !== resources.Knowledge && otherReq.resource.currentQuantity < otherReq.quantity) {
                    blockKnowledge = false;
                }
            }

            for (let j = 0; j < otherObject.resourceRequirements.length; j++) {
                let otherReq = otherObject.resourceRequirements[j];
                let resource = otherReq.resource;
                for (let k = 0; k < action.resourceRequirements.length; k++) {
                    let actionReq = action.resourceRequirements[k];

                    if ((resource !== resources.Knowledge || blockKnowledge) && actionReq.resource === resource && otherReq.quantity > resource.currentQuantity - actionReq.quantity) {
                        return {res: resource, target: otherObject, cause: "queue"};
                    }
                }
            }
        }

        for (let i = 0; i < state.triggerTargets.length; i++) {
            let otherObject = state.triggerTargets[i];
            // Unlike queue triggers won't be processed without respective script option enabled, no need to reserve resources for something that won't ever happen
            if (!settings.autoBuild && !settings.autoARPA && otherObject instanceof Action) {
                continue;
            }
            if (!settings.autoResearch && otherObject instanceof Technology) {
                continue;
            }

            let blockKnowledge = true;
            for (let j = 0; j < otherObject.resourceRequirements.length; j++) {
                let otherReq = otherObject.resourceRequirements[j];
                if (otherReq.resource !== resources.Knowledge && otherReq.resource.currentQuantity < otherReq.quantity) {
                    blockKnowledge = false;
                }
            }

            for (let j = 0; j < otherObject.resourceRequirements.length; j++) {
                let otherReq = otherObject.resourceRequirements[j];
                let resource = otherReq.resource;
                for (let k = 0; k < action.resourceRequirements.length; k++) {
                    let actionReq = action.resourceRequirements[k];

                    if ((resource !== resources.Knowledge || blockKnowledge) && actionReq.resource === resource && otherReq.quantity > resource.currentQuantity - actionReq.quantity) {
                        return {res: resource, target: otherObject, cause: "trigger"};
                    }
                }
            }
        }
        return null;
    }

    function resetMultiplier() {
        // Make sure no multipliers keys are pressed, having them on while script clicking buttons may lead to nasty consequences, including loss of resources(if auto storage remove 25000 crates instead of 1)
        if (state.multiplierTick !== state.scriptTick && game.global.settings.mKeys) {
            state.multiplierTick = state.scriptTick;
            document.dispatchEvent(new KeyboardEvent("keyup", {key: game.global.settings.keyMap.x10}));
            document.dispatchEvent(new KeyboardEvent("keyup", {key: game.global.settings.keyMap.x25}));
            document.dispatchEvent(new KeyboardEvent("keyup", {key: game.global.settings.keyMap.x100}));
        }
    }

    function getRealNumber(amountText) {
        if (amountText === "") { return 0; }

        let numericPortion = parseFloat(amountText);
        let lastChar = amountText[amountText.length - 1];

        if (numberSuffix[lastChar] !== undefined) {
            numericPortion *= numberSuffix[lastChar];
        }

        return numericPortion;
    }

    function getNumberString(amountValue) {
        let suffixes = Object.keys(numberSuffix);
        for (let i = suffixes.length - 1; i >= 0; i--) {
            if (amountValue > numberSuffix[suffixes[i]]) {
                return (amountValue / numberSuffix[suffixes[i]]).toFixed(1) + suffixes[i];
            }
        }
        return Math.ceil(amountValue);
    }

    function getNiceNumber(amountValue) {
        return parseFloat(amountValue < 1 ? amountValue.toPrecision(2) : amountValue.toFixed(2));
    }

    function getGovernor() {
        return game.global.race.governor?.g?.bg ?? "";
    }

    function haveTask(task) {
        return Object.values(game.global.race.governor?.tasks ?? {}).includes(task);
    }

    function haveTech(research, level = 1) {
        return game.global.tech[research] && game.global.tech[research] >= level;
    }

    function isHungryRace() {
        return game.global.race['carnivore'] || game.global.race['ravenous'];
    }

    function isHunterRace() {
        return game.global.race['carnivore'] || game.global.race['soul_eater'];
    }

    function isDemonRace() {
        return game.global.race['soul_eater'] && game.global.race.species !== 'wendigo';
    }

    function isLumberRace() {
        return !game.global.race['kindling_kindred'] && !game.global.race['smoldering'];
    }

    function resourceCost(obj, resource) {
        return obj.resourceRequirements.find(requirement => requirement.resource === resource)?.quantity ?? 0;
    }

    function getStorage(resource, building, title, powered = false) {
        let count = powered ? building.stateOnCount : building.count;
        return (count === 0
          ? parseFloat(building.definition.effect().match(new RegExp(`(?<=\\+)[0-9]+(?= Max ${resource})`))[0])
          : parseFloat(game.breakdown.c[resource][game.loc(title)]) / count);
    }

    function getOccCosts() {
        return game.global.civic.govern.type === "federation" ? 15 : 20;
    }

    function getGovName(govIndex) {
        let foreign = game.global.civic.foreign["gov" + govIndex];
        if (!foreign.name) {
            return "foreign power " + (govIndex + 1);
        }

        return poly.loc("civics_gov" + foreign.name.s0, [foreign.name.s1]) + ` (${govIndex + 1})`;
    }

    function getGovPower(govIndex) {
        // This function is full of hacks. But all that can be accomplished by wise player without peeking inside game variables
        // We really need to know power as accurate as possible, otherwise script becomes wonky when spies dies on mission
        let gov = game.global.civic.foreign["gov" + govIndex];
        if (gov.spy > 0) {
            // With 2+ spies we know exact number, for 1 we're assuming trick with advantage
            // We can see ambush advantage with a single spy, and knowing advantage we can calculate power
            // Proof of concept: military_power = army_offence / (5 / (1-advantage))
            // I'm not going to waste time parsing tooltips, and take that from internal variable instead
            return gov.mil;
        } else {
            // We're going to use another trick here. We know minimum and maximum power for gov
            // If current power is below minimum, that means we sabotaged it already, but spy died since that
            // We know we seen it for sure, so let's just peek inside, imitating memory
            // We could cache those values, but making it persistent in between of page reloads would be a pain
            // Especially considering that player can not only reset, but also import different save at any moment
            let minPower = [75, 125, 200, 650, 300];
            let maxPower = [125, 175, 300, 750, 300];
            if (game.global.race['truepath']) {
                [1.5, 1.4, 1.25].forEach((mod, idx) => {
                    minPower[idx] *= mod;
                    maxPower[idx] *= mod;
                });
            }

            if (gov.mil < minPower[govIndex]) {
                return gov.mil;
            } else {
                // Above minimum. Even if we ever sabotaged it, unfortunately we can't prove it. Not peeking inside, and assuming worst.
                return maxPower[govIndex];
            }
        }
    }

    function getVueById(elementId) {
        let element = win.document.getElementById(elementId);
        if (element === null || !element.__vue__) {
            return undefined;
        }

        return element.__vue__;
    }

    function log(type, text) {
        if (settings.autoLogging && type === loggingType) {
            console.log(text);
        }
    }

    function logClick(element, reason) {
        log("click", "click " + reason);
        element.click();
    }

    // Recursively traverse through object, wrapping all functions in getters
    function normalizeProperties(object, proto = []) {
        for (let key in object) {
            if (typeof object[key] === "object" && (object[key].constructor === Object || object[key].constructor === Array || proto.indexOf(object[key].constructor) !== -1)) {
                object[key] = normalizeProperties(object[key], proto);
            }
            if (typeof object[key] === "function") {
                let fn = object[key].bind(object);
                Object.defineProperty(object, key, {configurable: true, enumerable: true, get: () => fn()});
            }
        }
        return object;
    }

    var poly = {
    // Taken directly from game code with no functional changes, and minified.
        // export function arpaAdjustCosts(costs) from arpa.js
        arpaAdjustCosts: function(t){return t=function(r){if(game.global.race.creative){var n={};return Object.keys(r).forEach(function(t){n[t]=function(){return.8*r[t]()}}),n}return r}(t),poly.adjustCosts(t)},
        // function govPrice(gov) from civics.js
        govPrice: function(e){let i=game.global.civic.foreign[e],o=15384*i.eco;return o*=1+1.6*i.hstl/100,+(o*=1-.25*i.unrest/100).toFixed(0)},
        // export const galaxyOffers from resources.js
        // This one does *not* work exactly like in game: game's function is bugged, and doesn't track mutationg out of kindling kindred, here it's fixed, and change of trait will take immediate effect, without reloading page. Reimplementing this bug would require additional efforts, as polyfills initialized before we have access to game state, and we don't know traits at this time. Players doesn't mutate out of kindled kindered daily, and even if someone will - he will also need to fix game bug by reloading, and that will also sync return values of this poly with game implementation again, so no big deal...
        galaxyOffers: normalizeProperties([{buy:{res:"Deuterium",vol:5},sell:{res:"Helium_3",vol:25}},{buy:{res:"Neutronium",vol:2.5},sell:{res:"Copper",vol:200}},{buy:{res:"Adamantite",vol:3},sell:{res:"Iron",vol:300}},{buy:{res:"Elerium",vol:1},sell:{res:"Oil",vol:125}},{buy:{res:"Nano_Tube",vol:10},sell:{res:"Titanium",vol:20}},{buy:{res:"Graphene",vol:25},sell:{res:()=>game.global.race.kindling_kindred||game.global.race.smoldering?game.global.race.smoldering?"Chrysotile":"Stone":"Lumber",vol:1e3}},{buy:{res:"Stanene",vol:40},sell:{res:"Aluminium",vol:800}},{buy:{res:"Bolognium",vol:.75},sell:{res:"Uranium",vol:4}},{buy:{res:"Vitreloy",vol:1},sell:{res:"Infernite",vol:1}}]),
        // export const supplyValue from resources.js
        supplyValue: {Lumber:{in:.5,out:25e3},Chrysotile:{in:.5,out:25e3},Stone:{in:.5,out:25e3},Crystal:{in:3,out:25e3},Furs:{in:3,out:25e3},Copper:{in:1.5,out:25e3},Iron:{in:1.5,out:25e3},Aluminium:{in:2.5,out:25e3},Cement:{in:3,out:25e3},Coal:{in:1.5,out:25e3},Oil:{in:2.5,out:12e3},Uranium:{in:5,out:300},Steel:{in:3,out:25e3},Titanium:{in:3,out:25e3},Alloy:{in:6,out:25e3},Polymer:{in:6,out:25e3},Iridium:{in:8,out:25e3},Helium_3:{in:4.5,out:12e3},Deuterium:{in:4,out:1e3},Neutronium:{in:15,out:1e3},Adamantite:{in:12.5,out:1e3},Infernite:{in:25,out:250},Elerium:{in:30,out:250},Nano_Tube:{in:6.5,out:1e3},Graphene:{in:5,out:1e3},Stanene:{in:4.5,out:1e3},Bolognium:{in:18,out:1e3},Vitreloy:{in:14,out:1e3},Orichalcum:{in:10,out:1e3},Plywood:{in:10,out:250},Brick:{in:10,out:250},Wrought_Iron:{in:10,out:250},Sheet_Metal:{in:10,out:250},Mythril:{in:12.5,out:250},Aerogel:{in:16.5,out:250},Nanoweave:{in:18,out:250},Scarletite:{in:35,out:250}},
        // export const monsters from portal.js
        monsters: {fire_elm:{weapon:{laser:1.05,flame:0,plasma:.25,kinetic:.5,missile:.5,sonic:1,shotgun:.75,tesla:.65},nozone:{freeze:!0,flooded:!0},amp:{hot:1.75,humid:.8,steam:.9}},water_elm:{weapon:{laser:.65,flame:.5,plasma:1,kinetic:.2,missile:.5,sonic:.5,shotgun:.25,tesla:.75},nozone:{hot:!0,freeze:!0},amp:{steam:1.5,river:1.1,flooded:2,rain:1.75,humid:1.25}},rock_golem:{weapon:{laser:1,flame:.5,plasma:1,kinetic:.65,missile:.95,sonic:.75,shotgun:.35,tesla:0},nozone:{},amp:{}},bone_golem:{weapon:{laser:.45,flame:.35,plasma:.55,kinetic:1,missile:1,sonic:.75,shotgun:.75,tesla:.15},nozone:{},amp:{}},mech_dino:{weapon:{laser:.85,flame:.05,plasma:.55,kinetic:.45,missile:.5,sonic:.35,shotgun:.5,tesla:1},nozone:{},amp:{}},plant:{weapon:{laser:.42,flame:1,plasma:.65,kinetic:.2,missile:.25,sonic:.75,shotgun:.35,tesla:.38},nozone:{},amp:{}},crazed:{weapon:{laser:.5,flame:.85,plasma:.65,kinetic:1,missile:.35,sonic:.15,shotgun:.95,tesla:.6},nozone:{},amp:{}},minotaur:{weapon:{laser:.32,flame:.5,plasma:.82,kinetic:.44,missile:1,sonic:.15,shotgun:.2,tesla:.35},nozone:{},amp:{}},ooze:{weapon:{laser:.2,flame:.65,plasma:1,kinetic:0,missile:0,sonic:.85,shotgun:0,tesla:.15},nozone:{},amp:{}},zombie:{weapon:{laser:.35,flame:1,plasma:.45,kinetic:.08,missile:.8,sonic:.18,shotgun:.95,tesla:.05},nozone:{},amp:{}},raptor:{weapon:{laser:.68,flame:.55,plasma:.85,kinetic:1,missile:.44,sonic:.22,shotgun:.33,tesla:.66},nozone:{},amp:{}},frost_giant:{weapon:{laser:.9,flame:.82,plasma:1,kinetic:.25,missile:.08,sonic:.45,shotgun:.28,tesla:.5},nozone:{hot:!0},amp:{freeze:2.5,hail:1.65}},swarm:{weapon:{laser:.02,flame:1,plasma:.04,kinetic:.01,missile:.08,sonic:.66,shotgun:.38,tesla:.45},nozone:{},amp:{}},dragon:{weapon:{laser:.18,flame:0,plasma:.12,kinetic:.35,missile:1,sonic:.22,shotgun:.65,tesla:.15},nozone:{},amp:{}},mech_dragon:{weapon:{laser:.84,flame:.1,plasma:.68,kinetic:.18,missile:.75,sonic:.22,shotgun:.28,tesla:1},nozone:{},amp:{}},construct:{weapon:{laser:.5,flame:.2,plasma:.6,kinetic:.34,missile:.9,sonic:.08,shotgun:.28,tesla:1},nozone:{},amp:{}},beholder:{weapon:{laser:.75,flame:.15,plasma:1,kinetic:.45,missile:.05,sonic:.01,shotgun:.12,tesla:.3},nozone:{},amp:{}},worm:{weapon:{laser:.55,flame:.38,plasma:.45,kinetic:.2,missile:.05,sonic:1,shotgun:.02,tesla:.01},nozone:{},amp:{}},hydra:{weapon:{laser:.85,flame:.75,plasma:.85,kinetic:.25,missile:.45,sonic:.5,shotgun:.6,tesla:.65},nozone:{},amp:{}},colossus:{weapon:{laser:1,flame:.05,plasma:.75,kinetic:.45,missile:1,sonic:.35,shotgun:.35,tesla:.5},nozone:{},amp:{}},lich:{weapon:{laser:.1,flame:.1,plasma:.1,kinetic:.45,missile:.75,sonic:.35,shotgun:.75,tesla:.5},nozone:{},amp:{}},ape:{weapon:{laser:1,flame:.95,plasma:.85,kinetic:.5,missile:.5,sonic:.05,shotgun:.35,tesla:.68},nozone:{},amp:{}},bandit:{weapon:{laser:.65,flame:.5,plasma:.85,kinetic:1,missile:.5,sonic:.25,shotgun:.75,tesla:.25},nozone:{},amp:{}},croc:{weapon:{laser:.65,flame:.05,plasma:.6,kinetic:.5,missile:.5,sonic:1,shotgun:.2,tesla:.75},nozone:{},amp:{}},djinni:{weapon:{laser:0,flame:.35,plasma:1,kinetic:.15,missile:0,sonic:.65,shotgun:.22,tesla:.4},nozone:{},amp:{}},snake:{weapon:{laser:.5,flame:.5,plasma:.5,kinetic:.5,missile:.5,sonic:.5,shotgun:.5,tesla:.5},nozone:{},amp:{}},centipede:{weapon:{laser:.5,flame:.85,plasma:.95,kinetic:.65,missile:.6,sonic:0,shotgun:.5,tesla:.01},nozone:{},amp:{}},spider:{weapon:{laser:.65,flame:1,plasma:.22,kinetic:.75,missile:.15,sonic:.38,shotgun:.9,tesla:.18},nozone:{},amp:{}},manticore:{weapon:{laser:.05,flame:.25,plasma:.95,kinetic:.5,missile:.15,sonic:.48,shotgun:.4,tesla:.6},nozone:{},amp:{}},fiend:{weapon:{laser:.75,flame:.25,plasma:.5,kinetic:.25,missile:.75,sonic:.25,shotgun:.5,tesla:.5},nozone:{},amp:{}},bat:{weapon:{laser:.16,flame:.18,plasma:.12,kinetic:.25,missile:.02,sonic:1,shotgun:.9,tesla:.58},nozone:{},amp:{}},medusa:{weapon:{laser:.35,flame:.1,plasma:.3,kinetic:.95,missile:1,sonic:.15,shotgun:.88,tesla:.26},nozone:{},amp:{}},ettin:{weapon:{laser:.5,flame:.35,plasma:.8,kinetic:.5,missile:.25,sonic:.3,shotgun:.6,tesla:.09},nozone:{},amp:{}},faceless:{weapon:{laser:.6,flame:.28,plasma:.6,kinetic:0,missile:.05,sonic:.8,shotgun:.15,tesla:1},nozone:{},amp:{}},enchanted:{weapon:{laser:1,flame:.02,plasma:.95,kinetic:.2,missile:.7,sonic:.05,shotgun:.65,tesla:.01},nozone:{},amp:{}},gargoyle:{weapon:{laser:.15,flame:.4,plasma:.3,kinetic:.5,missile:.5,sonic:.85,shotgun:1,tesla:.2},nozone:{},amp:{}},chimera:{weapon:{laser:.38,flame:.6,plasma:.42,kinetic:.85,missile:.35,sonic:.5,shotgun:.65,tesla:.8},nozone:{},amp:{}},gorgon:{weapon:{laser:.65,flame:.65,plasma:.65,kinetic:.65,missile:.65,sonic:.65,shotgun:.65,tesla:.65},nozone:{},amp:{}},kraken:{weapon:{laser:.75,flame:.35,plasma:.75,kinetic:.35,missile:.5,sonic:.18,shotgun:.05,tesla:.85},nozone:{},amp:{}},homunculus:{weapon:{laser:.05,flame:1,plasma:.1,kinetic:.85,missile:.65,sonic:.5,shotgun:.75,tesla:.2},nozone:{},amp:{}}},
        // export function hellSupression(area, val) from portal.js
        hellSupression: function(t,e){switch(t){case"ruins":{let t=e||buildings.RuinsGuardPost.stateOnCount,r=75*buildings.RuinsArcology.stateOnCount,a=game.armyRating(t,"hellArmy",0);game.global.race.holy&&(a*=1.25);let l=(a+r)/5e3;return{supress:l>1?1:l,rating:a+r}}case"gate":{let t=poly.hellSupression("ruins",e),r=100*buildings.GateTurret.stateOnCount;game.global.race.holy&&(r*=1.25);let a=(t.rating+r)/7500;return{supress:a>1?1:a,rating:t.rating+r}}default:return 0}},
        // function taxCap(min) from civics.js
        taxCap: function(e){let a=haveTech("currency",5);if(e)return!a&&!game.global.race.terrifying||game.global.race.noble?10:0;{let e=30;return game.global.race.noble?e="oligarchy"===game.global.civic.govern.type?40:20:(e="oligarchy"===game.global.civic.govern.type?50:30,(a||game.global.race.terrifying)&&(e+=20)),"noble"===getGovernor()&&(e+=10),e}},
        // export function mechCost(size,infernal) from portal.js
        mechCost: function(e,a){let l=9999,r=1e7;switch(e){case"small":{let e=game.global.blood.prepared>=2?5e4:75e3;r=a?2.5*e:e,l=a?20:1}break;case"medium":r=a?45e4:18e4,l=a?100:4;break;case"large":r=a?925e3:375e3,l=a?500:20;break;case"titan":r=a?15e5:75e4,l=a?1500:75;break;case"collector":{let e=game.global.blood.prepared>=2?8e3:1e4;r=a?2.5*e:e,l=1}}return{s:l,c:r}},
        // function terrainRating(mech,rating,effects) from portal.js
        terrainRating: function(e,l,a){if(!e.equip.includes("special")||"small"!==e.size&&"medium"!==e.size&&"collector"!==e.size||l<1&&(l+=(1-l)*(a.includes("gravity")?.1:.2)),"small"!==e.size&&l<1){let e=0,i={small:0,medium:0,large:0,titan:0,collector:0};for(let l=0;l<game.global.portal.mechbay.mechs.length;l++){let a=game.global.portal.mechbay.mechs[l];(e+=MechManager.getMechSpace(a))<=game.global.portal.mechbay.max&&i[a.size]++}(l+=(a.includes("fog")||a.includes("dark")?.005:.01)*i.small)>1&&(l=1)}return l},
        // function weaponPower(mech,power) from portal.js
        weaponPower: function(e,i){return i<1&&0!==i&&e.equip.includes("special")&&"titan"===e.size&&(i+=.25*(1-i)),e.equip.includes("special")&&"large"===e.size&&(i*=1.02),i},
        // export function timeFormat(time) from functions.js
        timeFormat: function(e){let i;if(e<0)i=game.loc("time_never");else if((e=+e.toFixed(0))>60){let l=e%60,s=(e-l)/60;if(s>=60){let e=s%60,l=(s-e)/60;if(l>24){i=`${(l-(e=l%24))/24}d ${e}h`}else i=`${l}h ${e=("0"+e).slice(-2)}m`}else i=`${s=("0"+s).slice(-2)}m ${l=("0"+l).slice(-2)}s`}else i=`${e=("0"+e).slice(-2)}s`;return i},

    // Reimplemented:
        // export function crateValue() from resources.js
        crateValue: () => Number(getVueById("createHead")?.buildCrateDesc().match(/(\d+)/g)[1] ?? 0),
        // export function containerValue() from resources.js
        containerValue: () => Number(getVueById("createHead")?.buildContainerDesc().match(/(\d+)/g)[1] ?? 0),
        // export function piracy(region, true, true) from space.js
        piracy: region => Number(getVueById(region)?.$options.filters.defense(region) ?? 0),

    // Firefox compatibility:
        adjustCosts: (cost, wiki) => game.adjustCosts(cloneInto(cost, unsafeWindow, {cloneFunctions: true}), wiki),
        loc: (key, variables) => game.loc(key, cloneInto(variables, unsafeWindow)),
    };

    $().ready(mainAutoEvolveScript);

})($);
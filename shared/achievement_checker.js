/**
 * 成/**
 * 成就检测共享模块 · 六道众生
 * 各游戏通过 <script src="http://localhost/**
 * 成就检测共享模块 · 六道众生
 * 各游戏通过 <script src="http://localhost:8080/shared/achievement_checker.js"> 加载
 * 暴露 window.AchievementChecker 全局对象
 */
(function () {
/**
 * 成就检测共享模块 · 六道众生
 * 各游戏通过 <script src="http://localhost:8080/shared/achievement_checker.js"> 加载
 * 暴露 window.AchievementChecker 全局对象
 */
(function () {
    "use strict";

    var HUB_URL/**
 * 成就检测共享模块 · 六道众生
 * 各游戏通过 <script src="http://localhost:8080/shared/achievement_checker.js"> 加载
 * 暴露 window.AchievementChecker 全局对象
 */
(function () {
    "use strict";

    var HUB_URL = "http://localhost:8080";

    // 成就定义（与 main.py ACHIEVEMENT_DEFINITIONS 同步）
    var ACHIEVEMENTS = {
/**
 * 成就检测共享模块 · 六道众生
 * 各游戏通过 <script src="http://localhost:8080/shared/achievement_checker.js"> 加载
 * 暴露 window.AchievementChecker 全局对象
 */
(function () {
    "use strict";

    var HUB_URL = "http://localhost:8080";

    // 成就定义（与 main.py ACHIEVEMENT_DEFINITIONS 同步）
    var ACHIEVEMENTS = {
        ambush:            { name: "十面埋伏",      icon: "♟",  desc/**
 * 成就检测共享模块 · 六道众生
 * 各游戏通过 <script src="http://localhost:8080/shared/achievement_checker.js"> 加载
 * 暴露 window.AchievementChecker 全局对象
 */
(function () {
    "use strict";

    var HUB_URL = "http://localhost:8080";

    // 成就定义（与 main.py ACHIEVEMENT_DEFINITIONS 同步）
    var ACHIEVEMENTS = {
        ambush:            { name: "十面埋伏",      icon: "♟",  desc: "象棋中你的棋子数量≥20" },
        sea_of_pieces:     { name/**
 * 成就检测共享模块 · 六道众生
 * 各游戏通过 <script src="http://localhost:8080/shared/achievement_checker.js"> 加载
 * 暴露 window.AchievementChecker 全局对象
 */
(function () {
    "use strict";

    var HUB_URL = "http://localhost:8080";

    // 成就定义（与 main.py ACHIEVEMENT_DEFINITIONS 同步）
    var ACHIEVEMENTS = {
        ambush:            { name: "十面埋伏",      icon: "♟",  desc: "象棋中你的棋子数量≥20" },
        sea_of_pieces:     { name: "人海战术",      icon: "👥", desc: "棋盘上总棋/**
 * 成就检测共享模块 · 六道众生
 * 各游戏通过 <script src="http://localhost:8080/shared/achievement_checker.js"> 加载
 * 暴露 window.AchievementChecker 全局对象
 */
(function () {
    "use strict";

    var HUB_URL = "http://localhost:8080";

    // 成就定义（与 main.py ACHIEVEMENT_DEFINITIONS 同步）
    var ACHIEVEMENTS = {
        ambush:            { name: "十面埋伏",      icon: "♟",  desc: "象棋中你的棋子数量≥20" },
        sea_of_pieces:     { name: "人海战术",      icon: "👥", desc: "棋盘上总棋子数≥40" },
        last_man_standing: { name: "孤勇者",        icon: "🦸", desc: "你只剩1个棋子且游戏未结束"/**
 * 成就检测共享模块 · 六道众生
 * 各游戏通过 <script src="http://localhost:8080/shared/achievement_checker.js"> 加载
 * 暴露 window.AchievementChecker 全局对象
 */
(function () {
    "use strict";

    var HUB_URL = "http://localhost:8080";

    // 成就定义（与 main.py ACHIEVEMENT_DEFINITIONS 同步）
    var ACHIEVEMENTS = {
        ambush:            { name: "十面埋伏",      icon: "♟",  desc: "象棋中你的棋子数量≥20" },
        sea_of_pieces:     { name: "人海战术",      icon: "👥", desc: "棋盘上总棋子数≥40" },
        last_man_standing: { name: "孤勇者",        icon: "🦸", desc: "你只剩1个棋子且游戏未结束" },
        palette:           { name: "调色板",        icon: "🎨", desc: "让棋盘变色" },
        reality_stone:     { name: "现实宝石/**
 * 成就检测共享模块 · 六道众生
 * 各游戏通过 <script src="http://localhost:8080/shared/achievement_checker.js"> 加载
 * 暴露 window.AchievementChecker 全局对象
 */
(function () {
    "use strict";

    var HUB_URL = "http://localhost:8080";

    // 成就定义（与 main.py ACHIEVEMENT_DEFINITIONS 同步）
    var ACHIEVEMENTS = {
        ambush:            { name: "十面埋伏",      icon: "♟",  desc: "象棋中你的棋子数量≥20" },
        sea_of_pieces:     { name: "人海战术",      icon: "👥", desc: "棋盘上总棋子数≥40" },
        last_man_standing: { name: "孤勇者",        icon: "🦸", desc: "你只剩1个棋子且游戏未结束" },
        palette:           { name: "调色板",        icon: "🎨", desc: "让棋盘变色" },
        reality_stone:     { name: "现实宝石",      icon: "💎", desc: "改变棋盘线条/框架" },
        bigger_picture:    { name: "格局打开",      icon: "📐", desc: "修改棋盘尺寸" },
        lawn_party:/**
 * 成就检测共享模块 · 六道众生
 * 各游戏通过 <script src="http://localhost:8080/shared/achievement_checker.js"> 加载
 * 暴露 window.AchievementChecker 全局对象
 */
(function () {
    "use strict";

    var HUB_URL = "http://localhost:8080";

    // 成就定义（与 main.py ACHIEVEMENT_DEFINITIONS 同步）
    var ACHIEVEMENTS = {
        ambush:            { name: "十面埋伏",      icon: "♟",  desc: "象棋中你的棋子数量≥20" },
        sea_of_pieces:     { name: "人海战术",      icon: "👥", desc: "棋盘上总棋子数≥40" },
        last_man_standing: { name: "孤勇者",        icon: "🦸", desc: "你只剩1个棋子且游戏未结束" },
        palette:           { name: "调色板",        icon: "🎨", desc: "让棋盘变色" },
        reality_stone:     { name: "现实宝石",      icon: "💎", desc: "改变棋盘线条/框架" },
        bigger_picture:    { name: "格局打开",      icon: "📐", desc: "修改棋盘尺寸" },
        lawn_party:        { name: "草坪派对",      icon: "🌱", desc: "棋盘变成绿色/**
 * 成就检测共享模块 · 六道众生
 * 各游戏通过 <script src="http://localhost:8080/shared/achievement_checker.js"> 加载
 * 暴露 window.AchievementChecker 全局对象
 */
(function () {
    "use strict";

    var HUB_URL = "http://localhost:8080";

    // 成就定义（与 main.py ACHIEVEMENT_DEFINITIONS 同步）
    var ACHIEVEMENTS = {
        ambush:            { name: "十面埋伏",      icon: "♟",  desc: "象棋中你的棋子数量≥20" },
        sea_of_pieces:     { name: "人海战术",      icon: "👥", desc: "棋盘上总棋子数≥40" },
        last_man_standing: { name: "孤勇者",        icon: "🦸", desc: "你只剩1个棋子且游戏未结束" },
        palette:           { name: "调色板",        icon: "🎨", desc: "让棋盘变色" },
        reality_stone:     { name: "现实宝石",      icon: "💎", desc: "改变棋盘线条/框架" },
        bigger_picture:    { name: "格局打开",      icon: "📐", desc: "修改棋盘尺寸" },
        lawn_party:        { name: "草坪派对",      icon: "🌱", desc: "棋盘变成绿色系" },
        genshin:           { name: "我超，原",      icon:/**
 * 成就检测共享模块 · 六道众生
 * 各游戏通过 <script src="http://localhost:8080/shared/achievement_checker.js"> 加载
 * 暴露 window.AchievementChecker 全局对象
 */
(function () {
    "use strict";

    var HUB_URL = "http://localhost:8080";

    // 成就定义（与 main.py ACHIEVEMENT_DEFINITIONS 同步）
    var ACHIEVEMENTS = {
        ambush:            { name: "十面埋伏",      icon: "♟",  desc: "象棋中你的棋子数量≥20" },
        sea_of_pieces:     { name: "人海战术",      icon: "👥", desc: "棋盘上总棋子数≥40" },
        last_man_standing: { name: "孤勇者",        icon: "🦸", desc: "你只剩1个棋子且游戏未结束" },
        palette:           { name: "调色板",        icon: "🎨", desc: "让棋盘变色" },
        reality_stone:     { name: "现实宝石",      icon: "💎", desc: "改变棋盘线条/框架" },
        bigger_picture:    { name: "格局打开",      icon: "📐", desc: "修改棋盘尺寸" },
        lawn_party:        { name: "草坪派对",      icon: "🌱", desc: "棋盘变成绿色系" },
        genshin:           { name: "我超，原",      icon: "✨", desc: "棋盘变成紫色/**
 * 成就检测共享模块 · 六道众生
 * 各游戏通过 <script src="http://localhost:8080/shared/achievement_checker.js"> 加载
 * 暴露 window.AchievementChecker 全局对象
 */
(function () {
    "use strict";

    var HUB_URL = "http://localhost:8080";

    // 成就定义（与 main.py ACHIEVEMENT_DEFINITIONS 同步）
    var ACHIEVEMENTS = {
        ambush:            { name: "十面埋伏",      icon: "♟",  desc: "象棋中你的棋子数量≥20" },
        sea_of_pieces:     { name: "人海战术",      icon: "👥", desc: "棋盘上总棋子数≥40" },
        last_man_standing: { name: "孤勇者",        icon: "🦸", desc: "你只剩1个棋子且游戏未结束" },
        palette:           { name: "调色板",        icon: "🎨", desc: "让棋盘变色" },
        reality_stone:     { name: "现实宝石",      icon: "💎", desc: "改变棋盘线条/框架" },
        bigger_picture:    { name: "格局打开",      icon: "📐", desc: "修改棋盘尺寸" },
        lawn_party:        { name: "草坪派对",      icon: "🌱", desc: "棋盘变成绿色系" },
        genshin:           { name: "我超，原",      icon: "✨", desc: "棋盘变成紫色系" },
        clone_wars:        { name: "克隆战争",      icon: "/**
 * 成就检测共享模块 · 六道众生
 * 各游戏通过 <script src="http://localhost:8080/shared/achievement_checker.js"> 加载
 * 暴露 window.AchievementChecker 全局对象
 */
(function () {
    "use strict";

    var HUB_URL = "http://localhost:8080";

    // 成就定义（与 main.py ACHIEVEMENT_DEFINITIONS 同步）
    var ACHIEVEMENTS = {
        ambush:            { name: "十面埋伏",      icon: "♟",  desc: "象棋中你的棋子数量≥20" },
        sea_of_pieces:     { name: "人海战术",      icon: "👥", desc: "棋盘上总棋子数≥40" },
        last_man_standing: { name: "孤勇者",        icon: "🦸", desc: "你只剩1个棋子且游戏未结束" },
        palette:           { name: "调色板",        icon: "🎨", desc: "让棋盘变色" },
        reality_stone:     { name: "现实宝石",      icon: "💎", desc: "改变棋盘线条/框架" },
        bigger_picture:    { name: "格局打开",      icon: "📐", desc: "修改棋盘尺寸" },
        lawn_party:        { name: "草坪派对",      icon: "🌱", desc: "棋盘变成绿色系" },
        genshin:           { name: "我超，原",      icon: "✨", desc: "棋盘变成紫色系" },
        clone_wars:        { name: "克隆战争",      icon: "🧬", desc: "创建了自定义棋子" },
        zoo:               { name: "动物园/**
 * 成就检测共享模块 · 六道众生
 * 各游戏通过 <script src="http://localhost:8080/shared/achievement_checker.js"> 加载
 * 暴露 window.AchievementChecker 全局对象
 */
(function () {
    "use strict";

    var HUB_URL = "http://localhost:8080";

    // 成就定义（与 main.py ACHIEVEMENT_DEFINITIONS 同步）
    var ACHIEVEMENTS = {
        ambush:            { name: "十面埋伏",      icon: "♟",  desc: "象棋中你的棋子数量≥20" },
        sea_of_pieces:     { name: "人海战术",      icon: "👥", desc: "棋盘上总棋子数≥40" },
        last_man_standing: { name: "孤勇者",        icon: "🦸", desc: "你只剩1个棋子且游戏未结束" },
        palette:           { name: "调色板",        icon: "🎨", desc: "让棋盘变色" },
        reality_stone:     { name: "现实宝石",      icon: "💎", desc: "改变棋盘线条/框架" },
        bigger_picture:    { name: "格局打开",      icon: "📐", desc: "修改棋盘尺寸" },
        lawn_party:        { name: "草坪派对",      icon: "🌱", desc: "棋盘变成绿色系" },
        genshin:           { name: "我超，原",      icon: "✨", desc: "棋盘变成紫色系" },
        clone_wars:        { name: "克隆战争",      icon: "🧬", desc: "创建了自定义棋子" },
        zoo:               { name: "动物园",        icon: "🦁", desc: "/**
 * 成就检测共享模块 · 六道众生
 * 各游戏通过 <script src="http://localhost:8080/shared/achievement_checker.js"> 加载
 * 暴露 window.AchievementChecker 全局对象
 */
(function () {
    "use strict";

    var HUB_URL = "http://localhost:8080";

    // 成就定义（与 main.py ACHIEVEMENT_DEFINITIONS 同步）
    var ACHIEVEMENTS = {
        ambush:            { name: "十面埋伏",      icon: "♟",  desc: "象棋中你的棋子数量≥20" },
        sea_of_pieces:     { name: "人海战术",      icon: "👥", desc: "棋盘上总棋子数≥40" },
        last_man_standing: { name: "孤勇者",        icon: "🦸", desc: "你只剩1个棋子且游戏未结束" },
        palette:           { name: "调色板",        icon: "🎨", desc: "让棋盘变色" },
        reality_stone:     { name: "现实宝石",      icon: "💎", desc: "改变棋盘线条/框架" },
        bigger_picture:    { name: "格局打开",      icon: "📐", desc: "修改棋盘尺寸" },
        lawn_party:        { name: "草坪派对",      icon: "🌱", desc: "棋盘变成绿色系" },
        genshin:           { name: "我超，原",      icon: "✨", desc: "棋盘变成紫色系" },
        clone_wars:        { name: "克隆战争",      icon: "🧬", desc: "创建了自定义棋子" },
        zoo:               { name: "动物园",        icon: "🦁", desc: "在斗兽棋中创建新的动物棋子" },
        alchemist:         { name: "炼金术士",      icon: "/**
 * 成就检测共享模块 · 六道众生
 * 各游戏通过 <script src="http://localhost:8080/shared/achievement_checker.js"> 加载
 * 暴露 window.AchievementChecker 全局对象
 */
(function () {
    "use strict";

    var HUB_URL = "http://localhost:8080";

    // 成就定义（与 main.py ACHIEVEMENT_DEFINITIONS 同步）
    var ACHIEVEMENTS = {
        ambush:            { name: "十面埋伏",      icon: "♟",  desc: "象棋中你的棋子数量≥20" },
        sea_of_pieces:     { name: "人海战术",      icon: "👥", desc: "棋盘上总棋子数≥40" },
        last_man_standing: { name: "孤勇者",        icon: "🦸", desc: "你只剩1个棋子且游戏未结束" },
        palette:           { name: "调色板",        icon: "🎨", desc: "让棋盘变色" },
        reality_stone:     { name: "现实宝石",      icon: "💎", desc: "改变棋盘线条/框架" },
        bigger_picture:    { name: "格局打开",      icon: "📐", desc: "修改棋盘尺寸" },
        lawn_party:        { name: "草坪派对",      icon: "🌱", desc: "棋盘变成绿色系" },
        genshin:           { name: "我超，原",      icon: "✨", desc: "棋盘变成紫色系" },
        clone_wars:        { name: "克隆战争",      icon: "🧬", desc: "创建了自定义棋子" },
        zoo:               { name: "动物园",        icon: "🦁", desc: "在斗兽棋中创建新的动物棋子" },
        alchemist:         { name: "炼金术士",      icon: "⚗️", desc: "AI成功创建了自定义棋子" },
        architect:         { name/**
 * 成就检测共享模块 · 六道众生
 * 各游戏通过 <script src="http://localhost:8080/shared/achievement_checker.js"> 加载
 * 暴露 window.AchievementChecker 全局对象
 */
(function () {
    "use strict";

    var HUB_URL = "http://localhost:8080";

    // 成就定义（与 main.py ACHIEVEMENT_DEFINITIONS 同步）
    var ACHIEVEMENTS = {
        ambush:            { name: "十面埋伏",      icon: "♟",  desc: "象棋中你的棋子数量≥20" },
        sea_of_pieces:     { name: "人海战术",      icon: "👥", desc: "棋盘上总棋子数≥40" },
        last_man_standing: { name: "孤勇者",        icon: "🦸", desc: "你只剩1个棋子且游戏未结束" },
        palette:           { name: "调色板",        icon: "🎨", desc: "让棋盘变色" },
        reality_stone:     { name: "现实宝石",      icon: "💎", desc: "改变棋盘线条/框架" },
        bigger_picture:    { name: "格局打开",      icon: "📐", desc: "修改棋盘尺寸" },
        lawn_party:        { name: "草坪派对",      icon: "🌱", desc: "棋盘变成绿色系" },
        genshin:           { name: "我超，原",      icon: "✨", desc: "棋盘变成紫色系" },
        clone_wars:        { name: "克隆战争",      icon: "🧬", desc: "创建了自定义棋子" },
        zoo:               { name: "动物园",        icon: "🦁", desc: "在斗兽棋中创建新的动物棋子" },
        alchemist:         { name: "炼金术士",      icon: "⚗️", desc: "AI成功创建了自定义棋子" },
        architect:         { name: "建筑师",        icon: "🏗️
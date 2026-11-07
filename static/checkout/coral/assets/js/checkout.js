(function () {
    'use strict';

    var tradeId = (location.pathname.split('/').filter(Boolean).pop() || '');
    var state = { order: null, methods: [], selected: null, timer: null, poll: null };

    function $role(role) {
        return document.querySelector('[data-role="' + role + '"]');
    }

    function $roles(role) {
        return Array.prototype.slice.call(document.querySelectorAll('[data-role="' + role + '"]'));
    }

    function text(role, value) {
        $roles(role).forEach(function (el) {
            el.textContent = value == null ? '' : String(value);
        });
    }

    function toggle(el, visible) {
        if (el) el.hidden = !visible;
    }

    function api(path, body) {
        return fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(function (res) {
            return res.json();
        }).then(function (res) {
            if (!res || res.status_code !== 200 || !res.data) {
                throw new Error((res && res.message) || '请求失败');
            }
            return res.data;
        });
    }

    function money(order) {
        var fiat = order.fiat || '';
        return (order.money == null ? '--' : String(order.money)) + (fiat ? ' ' + fiat : '');
    }

    function notice(message, kind) {
        var el = $role('notice');
        if (!el) return;
        el.textContent = message || '';
        el.classList.remove('is-error', 'is-ok');
        if (kind) el.classList.add('is-' + kind);
        toggle(el, !!message);
    }

    function renderHeader(order) {
        text('order-id', order.order_id || '--');
        text('order-name', order.name || '');

        var support = $role('support');
        if (support) {
            if (order.support_url) {
                support.href = order.support_url;
                toggle(support, true);
            } else {
                toggle(support, false);
            }
        }
        text('money', money(order));
    }

    function overlay(title, message, actionUrl) {
        var el = $role('overlay');
        if (!el) return;
        text('overlay-title', title);
        text('overlay-text', message);
        var action = $role('overlay-action');
        if (action) {
            if (actionUrl) {
                action.href = actionUrl;
                toggle(action, true);
            } else {
                toggle(action, false);
            }
        }
        toggle(el, true);
    }

    function stopTimers() {
        if (state.timer) {
            clearInterval(state.timer);
            state.timer = null;
        }
        if (state.poll) {
            clearInterval(state.poll);
            state.poll = null;
        }
    }

    function startCountdown(expiredAt, createdAt) {
        if (state.timer) clearInterval(state.timer);
        var total = Math.max(1, (expiredAt || 0) - (createdAt || 0));

        function tick() {
            var remaining = Math.max(0, (expiredAt || 0) - Math.floor(Date.now() / 1000));
            var h = Math.floor(remaining / 3600);
            var m = Math.floor((remaining % 3600) / 60);
            var s = remaining % 60;
            text('timer', [h, m, s].map(function (v) {
                return ('0' + v).slice(-2);
            }).join(':'));

            if (remaining <= 0) {
                clearInterval(state.timer);
                state.timer = null;
                if (state.order && state.order.status === 1) {
                    overlay('支付超时', '订单已超过支付时限，请返回商户重新下单。', state.order.redirect_url);
                }
            }
        }

        tick();
        state.timer = setInterval(tick, 1000);
    }

    function showStage(name) {
        Array.prototype.slice.call(document.querySelectorAll('[data-stage]')).forEach(function (el) {
            el.hidden = el.getAttribute('data-stage') !== name;
        });
    }

    function copy(value, label) {
        if (!value) return;

        function done() {
            notice(label || '已复制', 'ok');
        }

        function fallback() {
            var area = document.createElement('textarea');
            area.value = value;
            area.style.position = 'fixed';
            area.style.left = '-9999px';
            document.body.appendChild(area);
            area.select();
            try {
                document.execCommand('copy');
                done();
            } catch (err) {
                notice('复制失败，请手动复制', 'error');
            }
            document.body.removeChild(area);
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(value).then(done).catch(fallback);
        } else {
            fallback();
        }
    }

    function bindCopy(role, getValue, label) {
        var el = $role(role);
        if (!el || el.dataset.bound) return;
        el.dataset.bound = '1';
        el.addEventListener('click', function () {
            copy(getValue(), label);
        });
    }

    function selectMethod() {
        var currency = $role('currency');
        var network = $role('network');
        if (!currency || !network) return;

        state.selected = state.methods.filter(function (m) {
            return m.currency === currency.value && m.network === network.value;
        })[0] || null;

        var preview = $role('preview');
        if (preview) {
            preview.textContent = state.selected
                ? state.selected.actual_amount + ' ' + state.selected.currency
                : '';
        }

        var button = $role('pay');
        if (button) button.disabled = !state.selected;
    }

    function fillMethods(methods) {
        var currency = $role('currency');
        var network = $role('network');
        if (!currency || !network) return;

        var currencies = [];
        methods.forEach(function (m) {
            if (currencies.indexOf(m.currency) < 0) currencies.push(m.currency);
        });

        currency.innerHTML = '';
        currencies.forEach(function (value) {
            var option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            currency.appendChild(option);
        });

        function syncNetworks() {
            network.innerHTML = '';
            methods.filter(function (m) {
                return m.currency === currency.value;
            }).forEach(function (m) {
                var option = document.createElement('option');
                option.value = m.network;
                option.textContent = m.token_net_name || m.network;
                network.appendChild(option);
            });
            selectMethod();
        }

        currency.onchange = syncNetworks;
        network.onchange = selectMethod;
        syncNetworks();
    }

    function loadMethods() {
        return api('/api/v1/pay/methods', { trade_id: tradeId }).then(function (data) {
            state.methods = data.methods || [];
            if (!state.methods.length) {
                notice('当前订单没有可用的支付方式', 'error');
                return;
            }
            fillMethods(state.methods);
        });
    }

    function pay() {
        if (!state.selected) return;
        var button = $role('pay');
        if (button) {
            button.disabled = true;
            button.dataset.label = button.textContent;
            button.textContent = '正在创建订单…';
        }

        api('/api/v1/pay/update-order', {
            trade_id: tradeId,
            currency: state.selected.currency,
            network: state.selected.network
        }).then(function (data) {
            if (!data.payment_url) throw new Error('缺少支付地址');
            location.href = data.payment_url;
        }).catch(function (err) {
            if (button) {
                button.disabled = false;
                button.textContent = button.dataset.label || '继续付款';
            }
            notice(err.message || '创建订单失败', 'error');
        });
    }

    function renderPay(order) {
        var network = order.network || {};
        var currency = network.crypto || '';
        var amount = order.actual_amount || '--';
        var networkName = network.name || '';
        var address = order.token || order.address || '';

        text('pay-amount', amount);
        text('pay-currency', currency);
        text('pay-network', networkName);
        text('pay-address', address);
        text('pay-money', money(order));
        text('pay-order-id', order.order_id || '--');

        var qr = $role('qr');
        if (qr && window.jQuery && jQuery.fn && jQuery.fn.qrcode) {
            jQuery(qr).empty().qrcode({
                text: address,
                width: 208,
                height: 208,
                correctLevel: 1
            });
        }

        bindCopy('copy-amount', function () {
            return amount;
        }, '金额已复制');
        bindCopy('copy-address', function () {
            return address;
        }, '地址已复制');

        var reselect = $role('reselect');
        if (reselect) {
            toggle(reselect, !!order.reselect);
            if (!reselect.dataset.bound) {
                reselect.dataset.bound = '1';
                reselect.addEventListener('click', function () {
                    showStage('select');
                    loadMethods().catch(function (err) {
                        notice(err.message, 'error');
                    });
                });
            }
        }

        startCountdown(order.expired_at, order.created_at);
        startPoll();
    }

    function handleStatus(data) {
        state.order = data;
        renderHeader(data);

        if (data.status === 2) {
            stopTimers();
            overlay('支付成功', '付款已确认，交易已完成。', data.redirect_url);
        } else if (data.status === 5) {
            notice('已检测到付款，正在等待区块链确认…', 'ok');
        } else if (data.status === 4) {
            stopTimers();
            overlay('订单已取消', '该订单已取消，请返回商户重新下单。', data.redirect_url);
        }
    }

    function startPoll() {
        if (state.poll) clearInterval(state.poll);
        state.poll = setInterval(function () {
            api('/api/v1/pay/info', { trade_id: tradeId }).then(handleStatus).catch(function () {});
        }, 5000);
    }

    function boot() {
        if (!tradeId) {
            notice('缺少交易编号', 'error');
            return;
        }

        var button = $role('pay');
        if (button) button.addEventListener('click', pay);

        api('/api/v1/pay/info', { trade_id: tradeId }).then(function (data) {
            state.order = data;
            renderHeader(data);

            if (data.status === 4) {
                showStage('none');
                handleStatus(data);
                return;
            }

            if (!data.trade_type || !data.token) {
                showStage('select');
                startCountdown(data.expired_at, data.created_at);
                loadMethods().catch(function (err) {
                    notice(err.message, 'error');
                });
                return;
            }

            showStage('pay');
            renderPay(data);
            startPoll();
        }).catch(function (err) {
            notice(err.message || '加载订单失败', 'error');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();

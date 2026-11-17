# APEX_V2_BROKER_COMPLIANCE.md

## OmniTradePro Apex V2.0 — Broker API Compliance Report

**Date:** 2026-11-17  
**Document Version:** 1.0  

---

## Executive Summary

This document validates the OmniTradePro Apex trading platform's compliance with Angel One SmartAPI, Shoonya NorenAPI, and Groww API specifications as of November 2026.

**Compliance Status:** ✅ Angel One (Partial) | ⚠️ Shoonya (Partial) | ❌ Groww (Not Implemented)

---

## Angel One SmartAPI Compliance

### Source: `core/broker_adapter.py`

#### 1. Authentication ✅
| Requirement | Implementation | Status |
|-------------|---------------|--------|
| API Key authentication | `generate_session()` uses SmartConnect | ✅ |
| 2FA with MPIN | Supported via `mpid` or `password` param | ✅ |
| TOTP validation | `generate_totp_code()` with rollover protection | ✅ |
| Session token storage | `jwt_token`, `feed_token`, `refresh_token` | ✅ |

#### 2. Session Expiration ⚠️
| Requirement | Implementation | Status |
|-------------|---------------|--------|
| 24-hour session | No auto-refresh implemented | ⚠️ |
| Token validation | Tokens stored but not validated | ⚠️ |

**Gap:** No automatic session refresh before 24-hour expiry. Sessions expire silently causing order rejection.

#### 3. Supported Order Types ✅
| Order Type | API Name | Implementation | Status |
|------------|----------|----------------|--------|
| Market | "MARKET" | PlaceOrder | ✅ |
| Limit | "LIMIT" | PlaceOrder | ✅ |
| Stop Loss Market | "STOPLOSS_MARKET" | Via SL-M variety | ✅ |
| Stop Loss Limit | "STOPLOSS_LIMIT" | Via SL-M variety | ✅ |

**Finding:** MARKET orders used in emergency stop may be problematic. Use LIMIT with buffer instead.

#### 4. Product Types ✅
| Product Type | API Value | Supported |
|--------------|-----------|-----------|
| Intraday | "INTRADAY" | ✅ |
| Cash & Carry | "CNC" | ✅ |
| Co-Optimization | "CO" | ✅ |

#### 5. Exchange Segments ✅
| Segment | API Name | Supported |
|---------|----------|-----------|
| NSE Cash | "NSE" | ✅ |
| BSE Cash | "BSE" | ✅ |
| NSE Derivatives | "NFO" | ✅ |

#### 6. Order Placement ✅
**Method:** `place_order(order: Order)`

**Validation:**
- Instrument resolution via `_build_token_subscription_list()` ✅
- Rate limiting via `smartapi_rate_limiter` ✅ (10 req/s)
- Order params validated for Angel One schema ✅

**Schema Compliant Fields:**
- `variety`: "NORMAL" | "STOPLOSS" | "AMO" ✅
- `tradingsymbol`: Validated from Scrip Master ✅
- `symboltoken`: String numeric ✅
- `transactiontype`: "BUY" | "SELL" ✅
- `exchange`: "NSE" | "BSE" | "NFO" ✅
- `ordertype`: As above ✅
- `producttype`: As above ✅
- `duration`: "DAY" ✅
- `price`: Float (0.0 for MARKET) ✅
- `quantity`: Integer ✅
- `triggerprice`: Optional ✅

#### 7. Order Modification ⚠️
**Method:** `modify_order(order_id, **kwargs)`

**Gap:** Only `price` and `quantity` can be modified. Doesn't support trailing stop, squareoff, etc.

#### 8. Order Cancellation ✅
**Method:** `cancel_order(order_id)`

Rate limited and properly implemented.

#### 9. Order Book ⚠️
**Method:** `get_order_history()`

**Gap:** Only returns historical orders from last session. Doesn't support real-time order status update.

#### 10. Trade Book ✅
**Method:** `get_positions()` returns Position objects with realised/unrealised P&L.

#### 11. Position Reconciliation ✅
**Method:** `get_positions()`

**Finding:** Positions reconciled from broker API. Implementation in `reconcile_positions()`:
```python
def reconcile_positions(self) -> Dict[str, dict]:
    with self._lock:
        positions = self.broker.get_positions()
        self._positions = {p.symbol: p.to_dict() for p in positions}
        return self._positions
```

#### 12. WebSocket Behavior ✅
| Requirement | Implementation | Status |
|-------------|---------------|--------|
| Authentication | Bearer token auth ✅ | ✅ |
| Connection | SmartWebSocketV2 ✅ | ✅ |
| Subscription | Token-based ✅ | ✅ |
| Data format | Touchline (tk/tf) parsed ✅ | ✅ |
| Reconnection | Auto-reconnect with backoff ✅ | ✅ |

**Milestone tracking** implemented in `ConnectionMilestone` enum.

#### 13. Rate Limits ✅
| Endpoint | Limit | Implementation |
|----------|-------|----------------|
| Order API | 10 req/s | `smartapi_rate_limiter.acquire(ApiEndpoint.ORDER)` ✅ |
| Quote API | 10 req/s | `smartapi_rate_limiter.acquire(ApiEndpoint.QUOTE)` ✅ |
| Historical Data | 3 req/s | `smartapi_rate_limiter.acquire(ApiEndpoint.HISTORICAL)` ✅ |

#### 14. IP Whitelisting ⚠️
**Note:** Angel One requires static IP for algorithmic trading. No IP validation in code.

---

## Shoonya NorenAPI Compliance

### Source: `core/brokers/shoonya_broker.py`

#### 1. Authentication ⚠️
| Requirement | Implementation | Status |
|-------------|---------------|--------|
| Password hashing | SHA-256 ✅ | ✅ |
| Appkey generation | `apk = sha256(uid\|SECRET)` ✅ | ✅ |
| TOTP validation | `pyotp.TOTP()` ✅ | ✅ |
| Session token | `user_token` stored ✅ | ✅ |

**Gap:** Uses hardcoded SECRET for web portal key derivation. Should be configurable.

#### 2. Session Expiration ⚠️
| Requirement | Implementation | Status |
|-------------|---------------|--------|
| Session validation | Not checked before use | ⚠️ |
| Auto-refresh | Not implemented | ⚠️ |

#### 3. Supported Order Types ❌
| Order Type | API Name | Status |
|------------|----------|--------|
| Market | "MARKET" | ❌ NOT SUPPORTED |
| Limit | "LIMIT" | ⚠️ Not yet implemented |
| SL-M | "MARKET" | ⚠️ Not yet implemented |

**CRITICAL GAP:** Shoonya does NOT support MARKET orders. Implementation defaults to MARKET.

#### 4. Product Types ❌
Not implemented.

#### 5. Order Placement ❌
`place_order()` method doesn't exist. Only authentication implemented.

#### 6. WebSocket Behavior ❌
Subscribe implemented but no order routing.

#### 7. Rate Limits ❌
Not implemented.

---

## Groww API Compliance

### Status: ❌ NOT IMPLEMENTED

Groww broker adapter is not present in the codebase. The `BrokerAdapter` references "angel", "shoonya", "groww" in UI but grows is not a broker option in `src/components/Cockpit.tsx`:

```tsx
<select className="input !w-[118px]" value={risk?.primaryBroker ?? "angel"}>
  <option value="angel">Angel One</option>
  <option value="shoonya">Shoonya</option>
  <option value="groww">Groww</option>
</select>
```

But only angel and shoonya have actual broker implementations.

---

## Compliance Gaps Summary

### Angel One
| Category | Gap | Risk |
|----------|-----|------|
| Session Refresh | No auto-refresh | Medium |
| Order Modification | Limited fields | Low |
| Order Status | No real-time update | Medium |
| IP Whitelisting | Not validated | Medium |

### Shoonya
| Category | Gap | Risk |
|----------|-----|------|
| MARKET Orders | Explicitly NOT supported | **CRITICAL** |
| Order Placement | Not implemented | **CRITICAL** |
| Rate Limiting | Not implemented | High |
| Product Types | Not implemented | High |

### Groww
| Category | Gap | Risk |
|----------|-----|------|
| Entire Adapter | Not implemented | **CRITICAL** |

---

## Required Fixes Before LIVE Mode

### P0 - Critical
1. [ ] **Remove MARKET order usage** from all broker paths
2. [ ] Implement LIMIT order with buffer as fallback
3. [ ] Document Shoonya MARKET order limitation

### P1 - High
4. [ ] Add session refresh to Angel One adapter
5. [ ] Implement Groww broker adapter OR remove from UI
6. [ ] Add order status polling mechanism

### P2 - Medium
7. [ ] Implement order modification for all fields
8. [ ] Add IP whitelisting validation
9. [ ] Add rate limit compliance for Shoonya

---

## Verification Checklist

- [ ] Angel One ORDER API test with all supported order types
- [ ] Session refresh test (24-hour simulation)
- [ ] WebSocket disconnect/reconnect cycle test
- [ ] Position reconciliation accuracy test
- [ ] Shoonya authentication test
- [ ] Shoonya order placement test (when implemented)

---

## API Documentation References

1. **Angel One SmartAPI**
   - Docs: https://docs.angelone.in/
   - Scrip Master: https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json
   - Rate Limits: 10 req/s (Orders, Quotes), 3 req/s (Historical)

2. **Shoonya NorenAPI**
   - Docs: https://www.shoonya.com/api-docs/
   - WebSocket: wss://api.shoonya.com/NorenWSTP/
   - **WARNING:** MARKET orders NOT supported

3. **Groww**
   - API: Not publicly documented
   - Status: Unimplemented

---

## Compliance Officer Sign-off

| Broker | Compliance Status | Date |
|--------|------------------|------|
| Angel One | Partial (requires MARKET removal) | Pending |
| Shoonya | Non-Compliant (requires implementation) | Pending |
| Groww | Not Implemented | Pending |

---

## Notes

1. The code contains placeholder for Groww in UI but no implementation exists
2. MARKET order usage MUST be removed before any broker can be considered LIVE ready
3. Shoonya has explicit MARKET order prohibition - code violates this
4. All order types should use LIMIT with slippage buffer for safety

---

*Document prepared by: Claude Code (Principal Trading Systems Architect)*  
*Next Review: 2026-11-24*
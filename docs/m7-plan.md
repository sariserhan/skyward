# M7 plan: checked baggage

**Status:** implemented 2026-09-24; see [m7-status.md](m7-status.md). Nothing
needed escalation, so the plan was recorded and implemented. Decisions: D-035
to D-037.

## What M6 left

- `AirportBag` (`scripts/airport/airport_bag.gd`), `AirportState.bags` and
  `Passenger.checked_bag_ids` have been reserved since M0, with no behavior.
- The turnaround includes `placeholder_baggage_service`, a timed placeholder.
- Local arrivals walk from the gate through `arrivals_hall` to `airport_exit`.
  Originating passengers pass a timed check-in (`PassengerFlow`, event
  `check_in`).

## Design

- **Bag identity (D-035).** `AirportBag` becomes a real entity, id
  `BAG_000123`, with:
  - `passenger_id`
  - `legs` (the flights the bag must fly) and a leg index
  - `kind`: `originating`, `local` or `transfer`
  - `state` plus `stage` (the processing stage it is in or heading for)
  - timestamps
  - missed or held information

  The same bag object is kept from creation to its end state, including across
  a transfer. Carry-ons stay as they were (cabin model).
- **Generation.** A dedicated `SimRng.STREAM_BAGGAGE`, after all passengers
  and connections. Checked-bag probability is set per airline (the first leg's
  airline), with an occasional second bag.
- **Logical processing (`BaggageSystem`, `scripts/airport/baggage_system.gd`).**
  Stages are airport config (`baggage.stages`): outbound sortation, transfer
  sortation, and reclaim delivery. Each has a transit time into it, finitely
  many servers, a queue, and a deterministic service time. A stable min-heap
  schedules transit arrivals, service completions, unloads and loads. There
  are no belts or vehicles.
- **States.** Stage detail comes from `stage`:
  - `created`
  - `in_transit`, `queued`, `sorting`
  - `ready_for_flight`, `loading`, `on_aircraft`, `departed`
  - `unloading`, `at_reclaim`, `collected`
  - `missed_flight`, `missed_connection`, `held`
- **Turnaround.** `placeholder_baggage_service` is replaced by two driven task
  kinds:
  - `baggage_unload` (after arrival secured): the aircraft's bags come off one
    by one at a configured rate, and the task ends with the last bag.
  - `baggage_load` (after unload): ready bags are loaded one at a time as they
    arrive.

  Pushback requires `baggage_load`. The M4 critical-path attribution applies
  unchanged.
- **Cutoff and finalization (D-036).**
  - **Bag cutoff:** the departure target minus `bag_cutoff_before_departure`
    (D-15). A bag not sorted and ready by then misses the flight
    (`missed_flight` for originating bags, `missed_connection` for transfer
    bags).
  - **Load finalization:** when the passenger gate has closed and the bag
    cutoff has passed. Bags of passengers not aboard then are not flown: queued
    or ready bags are held, and loaded ones are offloaded (costing loader time)
    and then held.
  - Load completes once finalized, with an empty queue and an idle loader.
  - Holds do not move the bag cutoff.
- **Reclaim.** A new landside node, `baggage_reclaim`, between Arrivals and the
  exit. A local arrival with checked bags walks there (`walking_to_reclaim`),
  waits (`waiting_at_reclaim`) until all their bags have been delivered,
  collects them, and then walks to the exit. Passengers without bags pass
  straight through.
- **Transfers.** Connecting bags go from unload to transfer sortation, then are
  ready for the outbound flight. Connection eligibility is unchanged: passenger
  and bag margins are independent. `bag_transfer_margin` is recorded.
- **Widebodies.** The same unload/load model: aggregate, rate-based timing on
  real bag objects.
- **UI.**
  - A flight baggage block: loaded / expected, sorting, transfer bags inbound,
    bag-cutoff countdown.
  - Turnaround task progress.
  - Passenger bag lines (id, status). A connector shows Passenger vs Bag:
    ON TRACK, AT RISK or MISSED CONNECTION.
- **Metrics.** `baggage_metrics()`.
- **Save schema v7 (D-037).** Bags, the baggage system (heap, stage queues and
  servers), and flight loader state, with validation.

## Demos

- **A:** a local arrival waits at reclaim for their own bag.
- **B:** a connector and bag both make it.
- **C:** NS 249's late bank. The 1A passenger makes AW 228, but their bag
  misses the D-15 bag cutoff.
- **D:** a slow baggage load on one flight holds its departure.

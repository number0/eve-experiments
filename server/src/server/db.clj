
(ns server.db
  (:require [server.edb :as edb]
            [server.exec :as exec]))


;; need to put some thought into what this timestamp is
;; should probably (?) be at least monotonic, and likely
;; include some form of node identity
(defn now[] (System/currentTimeMillis))

;; in the nwo this should open the insert endpoint and then close it
(defn insert [db e a v b u]
  ((db edb/insert-oid (fn [o t] ())) 'insert (list e a v b (now) u)))


(def uber-log (atom ()))

;; maybe in the db?
(def oidcounter (atom 100))
(defn genoid [] (swap! oidcounter (fn [x] (+ x 1))))
;; permanent allocations
(def name-oid 10)
(def implication-oid 11)
(def contains-oid 12)

(defn insert-implication [db relname parameters program user bag]
  (insert db relname
          implication-oid (list parameters program) user bag))

(defn for-each-implication [db sig handler]
  ;; only really for insert, right?
  (let [terminus (fn [op tuple]
                   (handler (first tuple) (second tuple)))
        prog (list
              (list 'allocate [0] 4)
              (list 'tuple [2] [1])
              (list 'bind [1] [2] 
                    (list (list 'equal [3] [2 0] sig) '(filter [3])
                          (list 'equal [3] [2 1] implication-oid) '(filter [3])
                          (list 'send terminus [2 2])))
              (list 'open [3] edb/full-scan-oid [1])
              (list 'send [3] []))
        
        e (exec/open db prog [])]
    (e 'flush [])))


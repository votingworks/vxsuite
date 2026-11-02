--
-- PostgreSQL database dump
--


-- Dumped from database version 15.19 (Debian 15.19-0+deb12u1)
-- Dumped by pg_dump version 15.19 (Debian 15.19-0+deb12u1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: natural_sort; Type: COLLATION; Schema: public; Owner: -
--

CREATE COLLATION public.natural_sort (provider = icu, locale = 'en-u-kn-true');


--
-- Name: election_external_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.election_external_source AS ENUM (
    'ms-sems'
);


--
-- Name: polling_place_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.polling_place_type AS ENUM (
    'absentee',
    'early_voting',
    'election_day'
);


--
-- Name: state_code; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.state_code AS ENUM (
    'DEMO',
    'MS',
    'NH',
    'MI'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: background_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.background_tasks (
    id text NOT NULL,
    task_name text NOT NULL,
    payload text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    error text,
    progress jsonb,
    interrupted_at timestamp without time zone
);


--
-- Name: candidates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.candidates (
    id text NOT NULL,
    contest_id text NOT NULL,
    first_name text,
    middle_name text,
    last_name text,
    ballot_order integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    designation text
);


--
-- Name: candidates_ballot_order_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.candidates_ballot_order_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: candidates_ballot_order_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.candidates_ballot_order_seq OWNED BY public.candidates.ballot_order;


--
-- Name: candidates_parties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.candidates_parties (
    candidate_id text NOT NULL,
    party_id text NOT NULL
);


--
-- Name: contests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contests (
    id text NOT NULL,
    election_id text NOT NULL,
    title text NOT NULL,
    type text NOT NULL,
    district_id text NOT NULL,
    seats integer,
    allow_write_ins boolean,
    party_id text,
    term_description text,
    description text,
    yes_option_id text,
    yes_option_label text,
    no_option_id text,
    no_option_label text,
    ballot_order integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    additional_options jsonb
);


--
-- Name: contests_ballot_order_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contests_ballot_order_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contests_ballot_order_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contests_ballot_order_seq OWNED BY public.contests.ballot_order;


--
-- Name: districts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.districts (
    id text NOT NULL,
    election_id text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: districts_precinct_splits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.districts_precinct_splits (
    district_id text NOT NULL,
    precinct_split_id text NOT NULL
);


--
-- Name: districts_precincts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.districts_precincts (
    district_id text NOT NULL,
    precinct_id text NOT NULL
);


--
-- Name: elections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.elections (
    id text NOT NULL,
    jurisdiction_id text NOT NULL,
    system_settings_data text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    election_package_task_id text,
    election_package_url text,
    ballot_template_id text NOT NULL,
    ballots_finalized_at timestamp with time zone,
    ballot_language_codes text[] DEFAULT ARRAY[]::text[],
    type text,
    title text,
    date date,
    jurisdiction_name text,
    state text,
    seal text,
    ballot_paper_size text,
    ballot_compact boolean DEFAULT false NOT NULL,
    signature jsonb,
    last_exported_ballot_hash text,
    last_exported_election_data text,
    jurisdiction_external_id text NOT NULL,
    external_source public.election_external_source,
    ballots_approved_at timestamp with time zone,
    official_ballots_url text,
    sample_ballots_url text,
    test_ballots_url text,
    is_mi_combined_ballot_primary boolean DEFAULT false NOT NULL
);


--
-- Name: jurisdictions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jurisdictions (
    id text NOT NULL,
    name text NOT NULL,
    organization_id text NOT NULL,
    state_code public.state_code NOT NULL
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id text NOT NULL,
    name text NOT NULL
);


--
-- Name: parties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parties (
    id text NOT NULL,
    election_id text NOT NULL,
    name text NOT NULL,
    full_name text NOT NULL,
    abbrev text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: polling_places; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.polling_places (
    id text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    election_id text NOT NULL,
    name text NOT NULL,
    type public.polling_place_type NOT NULL
);


--
-- Name: polling_places_precincts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.polling_places_precincts (
    polling_place_id text NOT NULL,
    precinct_id text NOT NULL
);


--
-- Name: precinct_registered_voter_counts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.precinct_registered_voter_counts (
    precinct_id text NOT NULL,
    count integer NOT NULL
);


--
-- Name: precinct_split_registered_voter_counts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.precinct_split_registered_voter_counts (
    split_id text NOT NULL,
    count integer NOT NULL
);


--
-- Name: precinct_splits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.precinct_splits (
    id text NOT NULL,
    precinct_id text NOT NULL,
    name text NOT NULL,
    nh_options jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: precincts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.precincts (
    id text NOT NULL,
    election_id text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: candidates ballot_order; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidates ALTER COLUMN ballot_order SET DEFAULT nextval('public.candidates_ballot_order_seq'::regclass);


--
-- Name: contests ballot_order; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contests ALTER COLUMN ballot_order SET DEFAULT nextval('public.contests_ballot_order_seq'::regclass);


--
-- Name: background_tasks background_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.background_tasks
    ADD CONSTRAINT background_tasks_pkey PRIMARY KEY (id);


--
-- Name: candidates candidates_ballot_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidates
    ADD CONSTRAINT candidates_ballot_order_key UNIQUE (ballot_order);


--
-- Name: candidates_parties candidates_parties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidates_parties
    ADD CONSTRAINT candidates_parties_pkey PRIMARY KEY (candidate_id, party_id);


--
-- Name: candidates candidates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidates
    ADD CONSTRAINT candidates_pkey PRIMARY KEY (id);


--
-- Name: contests contests_ballot_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contests
    ADD CONSTRAINT contests_ballot_order_key UNIQUE (ballot_order);


--
-- Name: contests contests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contests
    ADD CONSTRAINT contests_pkey PRIMARY KEY (id);


--
-- Name: districts districts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.districts
    ADD CONSTRAINT districts_pkey PRIMARY KEY (id);


--
-- Name: districts_precinct_splits districts_precinct_splits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.districts_precinct_splits
    ADD CONSTRAINT districts_precinct_splits_pkey PRIMARY KEY (district_id, precinct_split_id);


--
-- Name: districts_precincts districts_precincts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.districts_precincts
    ADD CONSTRAINT districts_precincts_pkey PRIMARY KEY (district_id, precinct_id);


--
-- Name: elections elections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.elections
    ADD CONSTRAINT elections_pkey PRIMARY KEY (id);


--
-- Name: jurisdictions organizations_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jurisdictions
    ADD CONSTRAINT organizations_name_key UNIQUE (name);


--
-- Name: organizations organizations_name_key1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_name_key1 UNIQUE (name);


--
-- Name: jurisdictions organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jurisdictions
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey1 PRIMARY KEY (id);


--
-- Name: parties parties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parties
    ADD CONSTRAINT parties_pkey PRIMARY KEY (id);


--
-- Name: polling_places polling_places_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.polling_places
    ADD CONSTRAINT polling_places_pkey PRIMARY KEY (id);


--
-- Name: polling_places_precincts polling_places_precincts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.polling_places_precincts
    ADD CONSTRAINT polling_places_precincts_pkey PRIMARY KEY (polling_place_id, precinct_id);


--
-- Name: polling_places polling_places_uniq_election_id_name_type; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.polling_places
    ADD CONSTRAINT polling_places_uniq_election_id_name_type UNIQUE (election_id, name, type);


--
-- Name: precinct_registered_voter_counts precinct_registered_voters_counts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precinct_registered_voter_counts
    ADD CONSTRAINT precinct_registered_voters_counts_pkey PRIMARY KEY (precinct_id);


--
-- Name: precinct_split_registered_voter_counts precinct_split_registered_voters_counts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precinct_split_registered_voter_counts
    ADD CONSTRAINT precinct_split_registered_voters_counts_pkey PRIMARY KEY (split_id);


--
-- Name: precinct_splits precinct_splits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precinct_splits
    ADD CONSTRAINT precinct_splits_pkey PRIMARY KEY (id);


--
-- Name: precincts precincts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precincts
    ADD CONSTRAINT precincts_pkey PRIMARY KEY (id);


--
-- Name: candidates_unique_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX candidates_unique_index ON public.candidates USING btree (contest_id, first_name, middle_name, last_name) NULLS NOT DISTINCT;


--
-- Name: contests_unique_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX contests_unique_index ON public.contests USING btree (district_id, title, seats, term_description, party_id) NULLS NOT DISTINCT;


--
-- Name: districts_election_id_name_unique_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX districts_election_id_name_unique_index ON public.districts USING btree (election_id, name);


--
-- Name: elections_jurisdiction_id_title_date_unique_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX elections_jurisdiction_id_title_date_unique_index ON public.elections USING btree (jurisdiction_id, title, date) WHERE (title <> ''::text);


--
-- Name: parties_election_id_abbrev_unique_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX parties_election_id_abbrev_unique_index ON public.parties USING btree (election_id, abbrev);


--
-- Name: parties_election_id_full_name_unique_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX parties_election_id_full_name_unique_index ON public.parties USING btree (election_id, full_name);


--
-- Name: parties_election_id_name_unique_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX parties_election_id_name_unique_index ON public.parties USING btree (election_id, name);


--
-- Name: precinct_splits_precinct_id_name_unique_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX precinct_splits_precinct_id_name_unique_index ON public.precinct_splits USING btree (precinct_id, name);


--
-- Name: precincts_election_id_name_unique_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX precincts_election_id_name_unique_index ON public.precincts USING btree (election_id, name);


--
-- Name: candidates candidates_contest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidates
    ADD CONSTRAINT candidates_contest_id_fkey FOREIGN KEY (contest_id) REFERENCES public.contests(id) ON DELETE CASCADE;


--
-- Name: candidates_parties candidates_parties_candidate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidates_parties
    ADD CONSTRAINT candidates_parties_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.candidates(id) ON DELETE CASCADE;


--
-- Name: candidates_parties candidates_parties_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidates_parties
    ADD CONSTRAINT candidates_parties_party_id_fkey FOREIGN KEY (party_id) REFERENCES public.parties(id) ON DELETE CASCADE;


--
-- Name: contests contests_district_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contests
    ADD CONSTRAINT contests_district_id_fkey FOREIGN KEY (district_id) REFERENCES public.districts(id) ON DELETE CASCADE;


--
-- Name: contests contests_election_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contests
    ADD CONSTRAINT contests_election_id_fkey FOREIGN KEY (election_id) REFERENCES public.elections(id) ON DELETE CASCADE;


--
-- Name: contests contests_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contests
    ADD CONSTRAINT contests_party_id_fkey FOREIGN KEY (party_id) REFERENCES public.parties(id) ON DELETE SET NULL;


--
-- Name: districts districts_election_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.districts
    ADD CONSTRAINT districts_election_id_fkey FOREIGN KEY (election_id) REFERENCES public.elections(id) ON DELETE CASCADE;


--
-- Name: districts_precinct_splits districts_precinct_splits_district_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.districts_precinct_splits
    ADD CONSTRAINT districts_precinct_splits_district_id_fkey FOREIGN KEY (district_id) REFERENCES public.districts(id) ON DELETE CASCADE;


--
-- Name: districts_precinct_splits districts_precinct_splits_precinct_split_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.districts_precinct_splits
    ADD CONSTRAINT districts_precinct_splits_precinct_split_id_fkey FOREIGN KEY (precinct_split_id) REFERENCES public.precinct_splits(id) ON DELETE CASCADE;


--
-- Name: districts_precincts districts_precincts_district_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.districts_precincts
    ADD CONSTRAINT districts_precincts_district_id_fkey FOREIGN KEY (district_id) REFERENCES public.districts(id) ON DELETE CASCADE;


--
-- Name: districts_precincts districts_precincts_precinct_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.districts_precincts
    ADD CONSTRAINT districts_precincts_precinct_id_fkey FOREIGN KEY (precinct_id) REFERENCES public.precincts(id) ON DELETE CASCADE;


--
-- Name: elections elections_jurisdiction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.elections
    ADD CONSTRAINT elections_jurisdiction_id_fkey FOREIGN KEY (jurisdiction_id) REFERENCES public.jurisdictions(id) ON DELETE CASCADE;


--
-- Name: elections fk_background_tasks; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.elections
    ADD CONSTRAINT fk_background_tasks FOREIGN KEY (election_package_task_id) REFERENCES public.background_tasks(id) ON DELETE SET NULL;


--
-- Name: jurisdictions jurisdictions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jurisdictions
    ADD CONSTRAINT jurisdictions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: parties parties_election_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parties
    ADD CONSTRAINT parties_election_id_fkey FOREIGN KEY (election_id) REFERENCES public.elections(id) ON DELETE CASCADE;


--
-- Name: polling_places polling_places_election_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.polling_places
    ADD CONSTRAINT polling_places_election_id_fkey FOREIGN KEY (election_id) REFERENCES public.elections(id) ON DELETE CASCADE;


--
-- Name: polling_places_precincts polling_places_precincts_polling_place_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.polling_places_precincts
    ADD CONSTRAINT polling_places_precincts_polling_place_id_fkey FOREIGN KEY (polling_place_id) REFERENCES public.polling_places(id) ON DELETE CASCADE;


--
-- Name: polling_places_precincts polling_places_precincts_precinct_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.polling_places_precincts
    ADD CONSTRAINT polling_places_precincts_precinct_id_fkey FOREIGN KEY (precinct_id) REFERENCES public.precincts(id) ON DELETE CASCADE;


--
-- Name: precinct_registered_voter_counts precinct_registered_voters_counts_precinct_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precinct_registered_voter_counts
    ADD CONSTRAINT precinct_registered_voters_counts_precinct_id_fkey FOREIGN KEY (precinct_id) REFERENCES public.precincts(id) ON DELETE CASCADE;


--
-- Name: precinct_split_registered_voter_counts precinct_split_registered_voters_counts_split_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precinct_split_registered_voter_counts
    ADD CONSTRAINT precinct_split_registered_voters_counts_split_id_fkey FOREIGN KEY (split_id) REFERENCES public.precinct_splits(id) ON DELETE CASCADE;


--
-- Name: precinct_splits precinct_splits_precinct_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precinct_splits
    ADD CONSTRAINT precinct_splits_precinct_id_fkey FOREIGN KEY (precinct_id) REFERENCES public.precincts(id) ON DELETE CASCADE;


--
-- Name: precincts precincts_election_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precincts
    ADD CONSTRAINT precincts_election_id_fkey FOREIGN KEY (election_id) REFERENCES public.elections(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--



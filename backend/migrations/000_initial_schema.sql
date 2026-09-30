--
-- PostgreSQL database dump
--

\restrict yMjKsAxsyhKFbdHC8PZqaIeUQ9YJpJwO8GbG77tomiJbXvDOwvVdKcXBKguRC6a

-- Dumped from database version 14.24
-- Dumped by pg_dump version 14.24

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: dukaflow_assign_branch_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dukaflow_assign_branch_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN IF NEW.branch_id IS NULL THEN NEW.branch_id:=dukaflow_current_branch_id(); END IF; IF NEW.branch_id IS NULL THEN SELECT id INTO NEW.branch_id FROM branches WHERE business_id=NEW.business_id AND code='MAIN' LIMIT 1; END IF; IF NEW.branch_id IS NULL THEN RAISE EXCEPTION 'Branch required'; END IF; RETURN NEW; END $$;


--
-- Name: dukaflow_cleanup_idempotency_keys(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dukaflow_cleanup_idempotency_keys() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    DELETE FROM api_idempotency_keys WHERE expires_at < NOW();
    RETURN NEW;
END;
$$;


--
-- Name: dukaflow_create_default_subscription(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dukaflow_create_default_subscription() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    free_plan_id BIGINT;
BEGIN
    SELECT id INTO free_plan_id FROM subscription_plans WHERE code = 'free' LIMIT 1;
    IF free_plan_id IS NOT NULL THEN
        INSERT INTO subscriptions (business_id, plan_id, status, starts_at, trial_ends_at)
        VALUES (NEW.id, free_plan_id, 'active', NOW(), NULL)
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: dukaflow_current_branch_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dukaflow_current_branch_id() RETURNS bigint
    LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.branch_id',true),'')::BIGINT $$;


--
-- Name: dukaflow_current_business_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dukaflow_current_business_id() RETURNS bigint
    LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.business_id',true),'')::BIGINT $$;


--
-- Name: dukaflow_touch_dashboard_widget_preferences(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dukaflow_touch_dashboard_widget_preferences() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: dukaflow_touch_expenses(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dukaflow_touch_expenses() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN NEW.updated_at=NOW();RETURN NEW;END $$;


--
-- Name: dukaflow_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dukaflow_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_actions (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    user_id bigint NOT NULL,
    action_name character varying(80) NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    result jsonb,
    confirmation_token_hash character varying(128),
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    executed_at timestamp with time zone
);

ALTER TABLE ONLY public.ai_actions FORCE ROW LEVEL SECURITY;


--
-- Name: ai_actions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.ai_actions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.ai_actions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ai_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_conversations (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    user_id bigint NOT NULL,
    title character varying(160),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id bigint NOT NULL
);

ALTER TABLE ONLY public.ai_conversations FORCE ROW LEVEL SECURITY;


--
-- Name: ai_conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.ai_conversations ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.ai_conversations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ai_memories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_memories (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    user_id bigint,
    memory_type character varying(40) DEFAULT 'preference'::character varying NOT NULL,
    content text NOT NULL,
    importance numeric(4,3) DEFAULT 0.5 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id bigint NOT NULL,
    CONSTRAINT ai_memories_importance_check CHECK (((importance >= (0)::numeric) AND (importance <= (1)::numeric)))
);

ALTER TABLE ONLY public.ai_memories FORCE ROW LEVEL SECURITY;


--
-- Name: ai_memories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.ai_memories ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.ai_memories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ai_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_messages (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    conversation_id bigint NOT NULL,
    user_id bigint,
    role character varying(20) NOT NULL,
    content text,
    tool_name character varying(120),
    tool_payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id bigint NOT NULL,
    CONSTRAINT ai_messages_role_check CHECK (((role)::text = ANY ((ARRAY['system'::character varying, 'user'::character varying, 'assistant'::character varying, 'tool'::character varying])::text[])))
);

ALTER TABLE ONLY public.ai_messages FORCE ROW LEVEL SECURITY;


--
-- Name: ai_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.ai_messages ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.ai_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: api_idempotency_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_idempotency_keys (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    user_id bigint,
    idempotency_key character varying(120) NOT NULL,
    route character varying(120) NOT NULL,
    status_code integer,
    response_body jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL,
    branch_id bigint NOT NULL
);

ALTER TABLE ONLY public.api_idempotency_keys FORCE ROW LEVEL SECURITY;


--
-- Name: api_idempotency_keys_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.api_idempotency_keys ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.api_idempotency_keys_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: approval_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_requests (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    requested_by bigint NOT NULL,
    reviewed_by bigint,
    action_type character varying(50) NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id bigint,
    amount numeric(12,2),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    notes character varying(500),
    review_notes character varying(500),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    branch_id bigint NOT NULL,
    CONSTRAINT approval_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'cancelled'::character varying])::text[])))
);

ALTER TABLE ONLY public.approval_requests FORCE ROW LEVEL SECURITY;


--
-- Name: approval_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.approval_requests ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.approval_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    user_id bigint,
    action character varying(80) NOT NULL,
    entity_type character varying(80),
    entity_id bigint,
    details jsonb,
    ip_address character varying(64),
    user_agent character varying(500),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id bigint NOT NULL
);

ALTER TABLE ONLY public.audit_logs FORCE ROW LEVEL SECURITY;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: backup_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backup_runs (
    id bigint NOT NULL,
    status character varying(20) NOT NULL,
    backup_type character varying(30) DEFAULT 'logical'::character varying NOT NULL,
    target character varying(255),
    file_path text,
    size_bytes bigint,
    checksum_sha256 character varying(64),
    error_message text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT backup_runs_status_check CHECK (((status)::text = ANY ((ARRAY['started'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])))
);


--
-- Name: backup_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.backup_runs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.backup_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    name character varying(150) NOT NULL,
    code character varying(40) NOT NULL,
    phone character varying(30),
    address character varying(255),
    city character varying(100),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: branches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.branches ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.branches_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: businesses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.businesses (
    id bigint NOT NULL,
    name character varying(150) NOT NULL,
    slug character varying(180) NOT NULL,
    phone character varying(30),
    email character varying(255),
    address character varying(255),
    city character varying(100),
    country character varying(100) DEFAULT 'Tanzania'::character varying NOT NULL,
    currency character varying(10) DEFAULT 'TZS'::character varying NOT NULL,
    timezone character varying(80) DEFAULT 'Africa/Dar_es_Salaam'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    logo_url text
);


--
-- Name: businesses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.businesses ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.businesses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cash_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_movements (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    register_id bigint NOT NULL,
    movement_type character varying(30) NOT NULL,
    amount numeric(12,2) NOT NULL,
    direction character varying(5) DEFAULT 'in'::character varying NOT NULL,
    reference_type character varying(40),
    reference_id bigint,
    note character varying(255),
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id bigint NOT NULL,
    CONSTRAINT cash_movements_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT cash_movements_direction_check CHECK (((direction)::text = ANY ((ARRAY['in'::character varying, 'out'::character varying])::text[]))),
    CONSTRAINT cash_movements_movement_type_check CHECK (((movement_type)::text = ANY ((ARRAY['opening'::character varying, 'sale'::character varying, 'cash_in'::character varying, 'cash_out'::character varying, 'refund'::character varying, 'adjustment'::character varying, 'closing'::character varying])::text[])))
);

ALTER TABLE ONLY public.cash_movements FORCE ROW LEVEL SECURITY;


--
-- Name: cash_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cash_movements ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cash_movements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cash_registers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_registers (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    opened_by bigint NOT NULL,
    status character varying(20) DEFAULT 'open'::character varying NOT NULL,
    opening_balance numeric(12,2) DEFAULT 0 NOT NULL,
    closing_balance numeric(12,2),
    expected_balance numeric(12,2),
    notes character varying(255),
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    branch_id bigint NOT NULL,
    CONSTRAINT cash_registers_opening_balance_check CHECK ((opening_balance >= (0)::numeric)),
    CONSTRAINT cash_registers_status_check CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'closed'::character varying])::text[])))
);

ALTER TABLE ONLY public.cash_registers FORCE ROW LEVEL SECURITY;


--
-- Name: cash_registers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cash_registers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cash_registers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: customer_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_notes (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    customer_id bigint NOT NULL,
    note text NOT NULL,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id bigint NOT NULL
);

ALTER TABLE ONLY public.customer_notes FORCE ROW LEVEL SECURITY;


--
-- Name: customer_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.customer_notes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.customer_notes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id bigint NOT NULL,
    name character varying(150) NOT NULL,
    phone character varying(30),
    email character varying(150),
    address character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    business_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    CONSTRAINT customers_name_not_empty CHECK ((length(TRIM(BOTH FROM name)) > 0))
);

ALTER TABLE ONLY public.customers FORCE ROW LEVEL SECURITY;


--
-- Name: customers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.customers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.customers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: dashboard_widget_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dashboard_widget_preferences (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    user_id bigint NOT NULL,
    widget_key character varying(60) NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    is_visible boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id bigint NOT NULL
);

ALTER TABLE ONLY public.dashboard_widget_preferences FORCE ROW LEVEL SECURITY;


--
-- Name: dashboard_widget_preferences_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.dashboard_widget_preferences ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.dashboard_widget_preferences_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: debt_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.debt_payments (
    id bigint NOT NULL,
    debt_id bigint NOT NULL,
    amount numeric(12,2) NOT NULL,
    payment_method character varying(20) NOT NULL,
    notes character varying(255),
    paid_at timestamp with time zone DEFAULT now() NOT NULL,
    business_id bigint NOT NULL,
    payment_reference character varying(100),
    mobile_money_provider character varying(50),
    created_by bigint,
    branch_id bigint NOT NULL,
    CONSTRAINT debt_payments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT debt_payments_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['cash'::character varying, 'mobile_money'::character varying, 'bank'::character varying])::text[])))
);

ALTER TABLE ONLY public.debt_payments FORCE ROW LEVEL SECURITY;


--
-- Name: debt_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.debt_payments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.debt_payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: debts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.debts (
    id bigint NOT NULL,
    sale_id bigint NOT NULL,
    customer_id bigint NOT NULL,
    total_amount numeric(12,2) NOT NULL,
    amount_paid numeric(12,2) DEFAULT 0 NOT NULL,
    balance numeric(12,2) NOT NULL,
    due_date date,
    status character varying(20) DEFAULT 'unpaid'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    business_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    CONSTRAINT debts_amount_paid_check CHECK ((amount_paid >= (0)::numeric)),
    CONSTRAINT debts_balance_check CHECK ((balance >= (0)::numeric)),
    CONSTRAINT debts_status_check CHECK (((status)::text = ANY ((ARRAY['unpaid'::character varying, 'partial'::character varying, 'paid'::character varying, 'overdue'::character varying])::text[]))),
    CONSTRAINT debts_total_amount_check CHECK ((total_amount >= (0)::numeric))
);

ALTER TABLE ONLY public.debts FORCE ROW LEVEL SECURITY;


--
-- Name: debts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.debts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.debts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: email_verification_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_verification_tokens (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    user_id bigint NOT NULL,
    token_hash character varying(128) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_verification_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.email_verification_tokens ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.email_verification_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    category character varying(100) NOT NULL,
    description character varying(255) NOT NULL,
    amount numeric(14,2) NOT NULL,
    payment_method character varying(30) DEFAULT 'cash'::character varying NOT NULL,
    reference character varying(120),
    expense_date date DEFAULT CURRENT_DATE NOT NULL,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT expenses_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT expenses_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['cash'::character varying, 'mobile_money'::character varying, 'bank'::character varying, 'other'::character varying])::text[])))
);

ALTER TABLE ONLY public.expenses FORCE ROW LEVEL SECURITY;


--
-- Name: expenses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.expenses ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.expenses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: integration_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_settings (
    provider character varying(40) NOT NULL,
    setting_key character varying(80) NOT NULL,
    setting_value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: loyalty_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loyalty_accounts (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    customer_id bigint NOT NULL,
    points_balance integer DEFAULT 0 NOT NULL,
    lifetime_points integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id bigint NOT NULL,
    CONSTRAINT loyalty_accounts_lifetime_points_check CHECK ((lifetime_points >= 0)),
    CONSTRAINT loyalty_accounts_points_balance_check CHECK ((points_balance >= 0))
);

ALTER TABLE ONLY public.loyalty_accounts FORCE ROW LEVEL SECURITY;


--
-- Name: loyalty_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.loyalty_accounts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.loyalty_accounts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: loyalty_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loyalty_transactions (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    account_id bigint NOT NULL,
    transaction_type character varying(20) NOT NULL,
    points integer NOT NULL,
    description character varying(255),
    sale_id bigint,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id bigint NOT NULL,
    CONSTRAINT loyalty_transactions_points_check CHECK ((points <> 0)),
    CONSTRAINT loyalty_transactions_transaction_type_check CHECK (((transaction_type)::text = ANY ((ARRAY['earn'::character varying, 'redeem'::character varying, 'adjustment'::character varying])::text[])))
);

ALTER TABLE ONLY public.loyalty_transactions FORCE ROW LEVEL SECURITY;


--
-- Name: loyalty_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.loyalty_transactions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.loyalty_transactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    user_id bigint,
    title character varying(150) NOT NULL,
    message character varying(500) NOT NULL,
    notification_type character varying(40) DEFAULT 'info'::character varying NOT NULL,
    priority character varying(20) DEFAULT 'normal'::character varying NOT NULL,
    action_url character varying(255),
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id bigint NOT NULL,
    CONSTRAINT notifications_priority_check CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'normal'::character varying, 'high'::character varying, 'critical'::character varying])::text[])))
);

ALTER TABLE ONLY public.notifications FORCE ROW LEVEL SECURITY;


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.notifications ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.notifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: offline_mutations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offline_mutations (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    user_id bigint NOT NULL,
    idempotency_key character varying(120) NOT NULL,
    method character varying(10) NOT NULL,
    path text NOT NULL,
    request_body jsonb DEFAULT '{}'::jsonb NOT NULL,
    response_status integer,
    response_body jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    branch_id bigint NOT NULL
);

ALTER TABLE ONLY public.offline_mutations FORCE ROW LEVEL SECURITY;


--
-- Name: offline_mutations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.offline_mutations ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.offline_mutations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    user_id bigint NOT NULL,
    token_hash character varying(128) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.password_reset_tokens ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.password_reset_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: payment_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_transactions (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    provider character varying(40) NOT NULL,
    merchant_reference character varying(80) NOT NULL,
    provider_tracking_id character varying(120),
    amount numeric(14,2) NOT NULL,
    currency character varying(10) DEFAULT 'TZS'::character varying NOT NULL,
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    provider_status character varying(80),
    confirmation_code character varying(160),
    payment_method character varying(80),
    plan_code character varying(30),
    billing_cycle character varying(20),
    redirect_url text,
    provider_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_transactions_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT payment_transactions_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying, 'reversed'::character varying])::text[])))
);


--
-- Name: payment_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.payment_transactions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.payment_transactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id integer NOT NULL,
    name character varying(150) NOT NULL,
    buying_price numeric(12,2) NOT NULL,
    selling_price numeric(12,2) NOT NULL,
    stock_quantity integer DEFAULT 0 NOT NULL,
    low_stock_threshold integer DEFAULT 5 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    business_id bigint NOT NULL,
    sku character varying(80),
    barcode character varying(80),
    category character varying(100),
    unit character varying(30) DEFAULT 'pcs'::character varying NOT NULL,
    branch_id bigint NOT NULL,
    image_key text,
    image_url text,
    CONSTRAINT products_buying_price_check CHECK ((buying_price >= (0)::numeric)),
    CONSTRAINT products_low_stock_threshold_check CHECK ((low_stock_threshold >= 0)),
    CONSTRAINT products_name_not_empty CHECK ((length(TRIM(BOTH FROM name)) > 0)),
    CONSTRAINT products_selling_price_check CHECK ((selling_price >= (0)::numeric)),
    CONSTRAINT products_stock_quantity_check CHECK ((stock_quantity >= 0))
);

ALTER TABLE ONLY public.products FORCE ROW LEVEL SECURITY;


--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.products ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.products_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: purchase_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_items (
    id bigint NOT NULL,
    purchase_id bigint NOT NULL,
    product_id integer NOT NULL,
    product_name character varying(150) NOT NULL,
    quantity integer NOT NULL,
    unit_cost numeric(12,2) NOT NULL,
    line_total numeric(12,2) NOT NULL,
    business_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    CONSTRAINT purchase_items_line_total_check CHECK ((line_total >= (0)::numeric)),
    CONSTRAINT purchase_items_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT purchase_items_unit_cost_check CHECK ((unit_cost >= (0)::numeric))
);

ALTER TABLE ONLY public.purchase_items FORCE ROW LEVEL SECURITY;


--
-- Name: purchase_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.purchase_items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.purchase_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: purchase_reference_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_reference_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_return_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_return_items (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    return_id bigint NOT NULL,
    purchase_item_id bigint NOT NULL,
    product_id integer NOT NULL,
    product_name character varying(150) NOT NULL,
    quantity integer NOT NULL,
    unit_cost numeric(12,2) NOT NULL,
    line_total numeric(12,2) NOT NULL,
    branch_id bigint NOT NULL,
    CONSTRAINT purchase_return_items_line_total_check CHECK ((line_total >= (0)::numeric)),
    CONSTRAINT purchase_return_items_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT purchase_return_items_unit_cost_check CHECK ((unit_cost >= (0)::numeric))
);

ALTER TABLE ONLY public.purchase_return_items FORCE ROW LEVEL SECURITY;


--
-- Name: purchase_return_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.purchase_return_items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.purchase_return_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: purchase_return_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_return_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_returns (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    purchase_id bigint NOT NULL,
    supplier_id bigint,
    return_number character varying(50) NOT NULL,
    total_amount numeric(12,2) NOT NULL,
    reason character varying(255),
    status character varying(20) DEFAULT 'completed'::character varying NOT NULL,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id bigint NOT NULL,
    CONSTRAINT purchase_returns_status_check CHECK (((status)::text = ANY ((ARRAY['completed'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT purchase_returns_total_amount_check CHECK ((total_amount >= (0)::numeric))
);

ALTER TABLE ONLY public.purchase_returns FORCE ROW LEVEL SECURITY;


--
-- Name: purchase_returns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.purchase_returns ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.purchase_returns_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchases (
    id bigint NOT NULL,
    reference_number character varying(40) NOT NULL,
    supplier_id bigint,
    subtotal numeric(12,2) NOT NULL,
    discount numeric(12,2) DEFAULT 0 NOT NULL,
    total_amount numeric(12,2) NOT NULL,
    amount_paid numeric(12,2) DEFAULT 0 NOT NULL,
    balance numeric(12,2) DEFAULT 0 NOT NULL,
    payment_method character varying(20) DEFAULT 'cash'::character varying NOT NULL,
    status character varying(20) DEFAULT 'paid'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    business_id bigint NOT NULL,
    payment_reference character varying(100),
    created_by bigint,
    branch_id bigint NOT NULL,
    CONSTRAINT purchases_amount_paid_check CHECK ((amount_paid >= (0)::numeric)),
    CONSTRAINT purchases_balance_check CHECK ((balance >= (0)::numeric)),
    CONSTRAINT purchases_discount_check CHECK ((discount >= (0)::numeric)),
    CONSTRAINT purchases_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['cash'::character varying, 'mobile_money'::character varying, 'bank'::character varying, 'credit'::character varying])::text[]))),
    CONSTRAINT purchases_status_check CHECK (((status)::text = ANY ((ARRAY['paid'::character varying, 'partial'::character varying, 'credit'::character varying])::text[]))),
    CONSTRAINT purchases_subtotal_check CHECK ((subtotal >= (0)::numeric)),
    CONSTRAINT purchases_total_amount_check CHECK ((total_amount >= (0)::numeric))
);

ALTER TABLE ONLY public.purchases FORCE ROW LEVEL SECURITY;


--
-- Name: purchases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.purchases ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.purchases_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: sale_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_items (
    id bigint NOT NULL,
    sale_id bigint NOT NULL,
    product_id integer NOT NULL,
    product_name character varying(150) NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    buying_price numeric(12,2) NOT NULL,
    line_total numeric(12,2) NOT NULL,
    profit_amount numeric(12,2) NOT NULL,
    business_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    CONSTRAINT sale_items_buying_price_check CHECK ((buying_price >= (0)::numeric)),
    CONSTRAINT sale_items_line_total_check CHECK ((line_total >= (0)::numeric)),
    CONSTRAINT sale_items_profit_amount_check CHECK ((profit_amount >= (0)::numeric)),
    CONSTRAINT sale_items_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT sale_items_unit_price_check CHECK ((unit_price >= (0)::numeric))
);

ALTER TABLE ONLY public.sale_items FORCE ROW LEVEL SECURITY;


--
-- Name: sale_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.sale_items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.sale_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: sale_return_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_return_items (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    return_id bigint NOT NULL,
    sale_item_id bigint NOT NULL,
    product_id integer NOT NULL,
    product_name character varying(150) NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    line_total numeric(12,2) NOT NULL,
    branch_id bigint NOT NULL,
    CONSTRAINT sale_return_items_line_total_check CHECK ((line_total >= (0)::numeric)),
    CONSTRAINT sale_return_items_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT sale_return_items_unit_price_check CHECK ((unit_price >= (0)::numeric))
);

ALTER TABLE ONLY public.sale_return_items FORCE ROW LEVEL SECURITY;


--
-- Name: sale_return_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.sale_return_items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.sale_return_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: sale_return_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sale_return_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sale_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_returns (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    sale_id bigint NOT NULL,
    customer_id bigint,
    return_number character varying(50) NOT NULL,
    total_amount numeric(12,2) NOT NULL,
    reason character varying(255),
    refund_method character varying(20) DEFAULT 'cash'::character varying NOT NULL,
    refund_reference character varying(100),
    status character varying(20) DEFAULT 'completed'::character varying NOT NULL,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id bigint NOT NULL,
    CONSTRAINT sale_returns_refund_method_check CHECK (((refund_method)::text = ANY ((ARRAY['cash'::character varying, 'mobile_money'::character varying, 'bank'::character varying, 'credit_balance'::character varying])::text[]))),
    CONSTRAINT sale_returns_status_check CHECK (((status)::text = ANY ((ARRAY['completed'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT sale_returns_total_amount_check CHECK ((total_amount >= (0)::numeric))
);

ALTER TABLE ONLY public.sale_returns FORCE ROW LEVEL SECURITY;


--
-- Name: sale_returns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.sale_returns ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.sale_returns_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales (
    id bigint NOT NULL,
    receipt_number character varying(40) NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    discount numeric(12,2) DEFAULT 0 NOT NULL,
    total_amount numeric(12,2) NOT NULL,
    payment_method character varying(20) NOT NULL,
    amount_paid numeric(12,2) DEFAULT 0 NOT NULL,
    change_amount numeric(12,2) DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'paid'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    customer_id bigint,
    business_id bigint NOT NULL,
    payment_reference character varying(100),
    mobile_money_provider character varying(50),
    created_by bigint,
    branch_id bigint NOT NULL,
    CONSTRAINT sales_amount_paid_check CHECK ((amount_paid >= (0)::numeric)),
    CONSTRAINT sales_change_amount_check CHECK ((change_amount >= (0)::numeric)),
    CONSTRAINT sales_discount_check CHECK ((discount >= (0)::numeric)),
    CONSTRAINT sales_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['cash'::character varying, 'mobile_money'::character varying, 'bank'::character varying, 'credit'::character varying])::text[]))),
    CONSTRAINT sales_status_check CHECK (((status)::text = ANY ((ARRAY['paid'::character varying, 'partial'::character varying, 'credit'::character varying])::text[]))),
    CONSTRAINT sales_subtotal_check CHECK ((subtotal >= (0)::numeric)),
    CONSTRAINT sales_total_amount_check CHECK ((total_amount >= (0)::numeric))
);

ALTER TABLE ONLY public.sales FORCE ROW LEVEL SECURITY;


--
-- Name: sales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.sales ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.sales_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: sales_receipt_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sales_receipt_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    id bigint NOT NULL,
    filename character varying(255) NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schema_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.schema_migrations ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.schema_migrations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    product_id integer NOT NULL,
    movement_type character varying(30) NOT NULL,
    quantity_change integer NOT NULL,
    reference_type character varying(40),
    reference_id bigint,
    notes character varying(255),
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id bigint NOT NULL,
    CONSTRAINT stock_movements_movement_type_check CHECK (((movement_type)::text = ANY ((ARRAY['purchase'::character varying, 'sale'::character varying, 'sale_return'::character varying, 'purchase_return'::character varying, 'adjustment'::character varying, 'damaged'::character varying, 'opening'::character varying, 'transfer'::character varying])::text[]))),
    CONSTRAINT stock_movements_quantity_change_check CHECK ((quantity_change <> 0))
);

ALTER TABLE ONLY public.stock_movements FORCE ROW LEVEL SECURITY;


--
-- Name: stock_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.stock_movements ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.stock_movements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_plans (
    id bigint NOT NULL,
    code character varying(30) NOT NULL,
    name character varying(80) NOT NULL,
    price_monthly numeric(12,2) DEFAULT 0 NOT NULL,
    price_yearly numeric(12,2) DEFAULT 0 NOT NULL,
    product_limit integer,
    customer_limit integer,
    user_limit integer,
    features jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT subscription_plans_price_monthly_check CHECK ((price_monthly >= (0)::numeric)),
    CONSTRAINT subscription_plans_price_yearly_check CHECK ((price_yearly >= (0)::numeric))
);


--
-- Name: subscription_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.subscription_plans ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.subscription_plans_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    plan_id bigint NOT NULL,
    status character varying(20) DEFAULT 'trial'::character varying NOT NULL,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    ends_at timestamp with time zone,
    trial_ends_at timestamp with time zone,
    external_reference character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT subscriptions_status_check CHECK (((status)::text = ANY ((ARRAY['trial'::character varying, 'active'::character varying, 'past_due'::character varying, 'cancelled'::character varying, 'expired'::character varying])::text[])))
);


--
-- Name: subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.subscriptions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.subscriptions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: supplier_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_payments (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    purchase_id bigint NOT NULL,
    supplier_id bigint NOT NULL,
    amount numeric(12,2) NOT NULL,
    payment_method character varying(20) NOT NULL,
    payment_reference character varying(100),
    notes character varying(255),
    paid_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by bigint,
    branch_id bigint NOT NULL,
    CONSTRAINT supplier_payments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT supplier_payments_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['cash'::character varying, 'mobile_money'::character varying, 'bank'::character varying])::text[])))
);

ALTER TABLE ONLY public.supplier_payments FORCE ROW LEVEL SECURITY;


--
-- Name: supplier_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.supplier_payments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.supplier_payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id bigint NOT NULL,
    name character varying(150) NOT NULL,
    phone character varying(30),
    email character varying(150),
    address character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    business_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    CONSTRAINT suppliers_name_not_empty CHECK ((length(TRIM(BOTH FROM name)) > 0))
);

ALTER TABLE ONLY public.suppliers FORCE ROW LEVEL SECURITY;


--
-- Name: suppliers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.suppliers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: system_health_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_health_checks (
    id bigint NOT NULL,
    component character varying(80) NOT NULL,
    status character varying(20) NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    checked_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: system_health_checks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.system_health_checks ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.system_health_checks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    name character varying(150) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'owner'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    business_id bigint NOT NULL,
    fcm_token text,
    default_branch_id bigint,
    email_verified_at timestamp with time zone,
    CONSTRAINT users_name_not_empty CHECK ((length(TRIM(BOTH FROM name)) > 0)),
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['owner'::character varying, 'manager'::character varying, 'cashier'::character varying])::text[])))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.users ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: whatsapp_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_accounts (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    phone_number_id character varying(120) NOT NULL,
    display_phone_number character varying(40),
    business_account_id character varying(120),
    access_token text,
    verify_token_hash character varying(128),
    app_secret_hash character varying(128),
    is_enabled boolean DEFAULT false NOT NULL,
    ai_enabled boolean DEFAULT true NOT NULL,
    auto_create_orders boolean DEFAULT true NOT NULL,
    human_takeover boolean DEFAULT true NOT NULL,
    welcome_message text,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_webhook_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.whatsapp_accounts FORCE ROW LEVEL SECURITY;


--
-- Name: whatsapp_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_accounts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.whatsapp_accounts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: whatsapp_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_contacts (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    account_id bigint NOT NULL,
    wa_id character varying(80) NOT NULL,
    phone character varying(40),
    name character varying(160),
    customer_id bigint,
    is_blocked boolean DEFAULT false NOT NULL,
    human_takeover boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.whatsapp_contacts FORCE ROW LEVEL SECURITY;


--
-- Name: whatsapp_contacts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_contacts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.whatsapp_contacts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: whatsapp_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_conversations (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    account_id bigint NOT NULL,
    contact_id bigint NOT NULL,
    status character varying(20) DEFAULT 'open'::character varying NOT NULL,
    ai_enabled boolean DEFAULT true NOT NULL,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT whatsapp_conversations_status_check CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'closed'::character varying, 'human'::character varying])::text[])))
);

ALTER TABLE ONLY public.whatsapp_conversations FORCE ROW LEVEL SECURITY;


--
-- Name: whatsapp_conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_conversations ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.whatsapp_conversations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: whatsapp_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_messages (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    conversation_id bigint NOT NULL,
    wa_message_id character varying(180),
    direction character varying(10) NOT NULL,
    sender_type character varying(20) NOT NULL,
    message_type character varying(30) DEFAULT 'text'::character varying NOT NULL,
    body text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status character varying(20) DEFAULT 'received'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT whatsapp_messages_direction_check CHECK (((direction)::text = ANY ((ARRAY['inbound'::character varying, 'outbound'::character varying])::text[]))),
    CONSTRAINT whatsapp_messages_sender_type_check CHECK (((sender_type)::text = ANY ((ARRAY['customer'::character varying, 'ai'::character varying, 'human'::character varying, 'system'::character varying])::text[])))
);

ALTER TABLE ONLY public.whatsapp_messages FORCE ROW LEVEL SECURITY;


--
-- Name: whatsapp_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_messages ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.whatsapp_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: whatsapp_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_orders (
    id bigint NOT NULL,
    business_id bigint NOT NULL,
    conversation_id bigint NOT NULL,
    sale_id bigint,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    total_amount numeric(14,2) DEFAULT 0 NOT NULL,
    customer_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT whatsapp_orders_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'confirmed'::character varying, 'cancelled'::character varying])::text[])))
);

ALTER TABLE ONLY public.whatsapp_orders FORCE ROW LEVEL SECURITY;


--
-- Name: whatsapp_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_orders ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.whatsapp_orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ai_actions ai_actions_confirmation_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_actions
    ADD CONSTRAINT ai_actions_confirmation_token_hash_key UNIQUE (confirmation_token_hash);


--
-- Name: ai_actions ai_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_actions
    ADD CONSTRAINT ai_actions_pkey PRIMARY KEY (id);


--
-- Name: ai_conversations ai_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_pkey PRIMARY KEY (id);


--
-- Name: ai_memories ai_memories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_memories
    ADD CONSTRAINT ai_memories_pkey PRIMARY KEY (id);


--
-- Name: ai_messages ai_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_messages
    ADD CONSTRAINT ai_messages_pkey PRIMARY KEY (id);


--
-- Name: api_idempotency_keys api_idempotency_keys_business_id_idempotency_key_route_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_idempotency_keys
    ADD CONSTRAINT api_idempotency_keys_business_id_idempotency_key_route_key UNIQUE (business_id, idempotency_key, route);


--
-- Name: api_idempotency_keys api_idempotency_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_idempotency_keys
    ADD CONSTRAINT api_idempotency_keys_pkey PRIMARY KEY (id);


--
-- Name: approval_requests approval_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: backup_runs backup_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_runs
    ADD CONSTRAINT backup_runs_pkey PRIMARY KEY (id);


--
-- Name: branches branches_business_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_business_id_code_key UNIQUE (business_id, code);


--
-- Name: branches branches_business_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_business_id_id_key UNIQUE (business_id, id);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: businesses businesses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses
    ADD CONSTRAINT businesses_pkey PRIMARY KEY (id);


--
-- Name: businesses businesses_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses
    ADD CONSTRAINT businesses_slug_key UNIQUE (slug);


--
-- Name: cash_movements cash_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_movements
    ADD CONSTRAINT cash_movements_pkey PRIMARY KEY (id);


--
-- Name: cash_registers cash_registers_business_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_registers
    ADD CONSTRAINT cash_registers_business_id_id_key UNIQUE (business_id, id);


--
-- Name: cash_registers cash_registers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_registers
    ADD CONSTRAINT cash_registers_pkey PRIMARY KEY (id);


--
-- Name: customer_notes customer_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_notes
    ADD CONSTRAINT customer_notes_pkey PRIMARY KEY (id);


--
-- Name: customers customers_business_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_business_id_id_key UNIQUE (business_id, id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: dashboard_widget_preferences dashboard_widget_preferences_business_id_user_id_widget_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_widget_preferences
    ADD CONSTRAINT dashboard_widget_preferences_business_id_user_id_widget_key_key UNIQUE (business_id, user_id, widget_key);


--
-- Name: dashboard_widget_preferences dashboard_widget_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_widget_preferences
    ADD CONSTRAINT dashboard_widget_preferences_pkey PRIMARY KEY (id);


--
-- Name: debt_payments debt_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_payments
    ADD CONSTRAINT debt_payments_pkey PRIMARY KEY (id);


--
-- Name: debts debts_business_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_business_id_id_key UNIQUE (business_id, id);


--
-- Name: debts debts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_pkey PRIMARY KEY (id);


--
-- Name: debts debts_sale_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_sale_id_key UNIQUE (sale_id);


--
-- Name: email_verification_tokens email_verification_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_pkey PRIMARY KEY (id);


--
-- Name: email_verification_tokens email_verification_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: integration_settings integration_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_settings
    ADD CONSTRAINT integration_settings_pkey PRIMARY KEY (provider, setting_key);


--
-- Name: loyalty_accounts loyalty_accounts_business_id_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_accounts
    ADD CONSTRAINT loyalty_accounts_business_id_customer_id_key UNIQUE (business_id, customer_id);


--
-- Name: loyalty_accounts loyalty_accounts_business_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_accounts
    ADD CONSTRAINT loyalty_accounts_business_id_id_key UNIQUE (business_id, id);


--
-- Name: loyalty_accounts loyalty_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_accounts
    ADD CONSTRAINT loyalty_accounts_pkey PRIMARY KEY (id);


--
-- Name: loyalty_transactions loyalty_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: offline_mutations offline_mutations_business_id_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_mutations
    ADD CONSTRAINT offline_mutations_business_id_idempotency_key_key UNIQUE (business_id, idempotency_key);


--
-- Name: offline_mutations offline_mutations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_mutations
    ADD CONSTRAINT offline_mutations_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: payment_transactions payment_transactions_merchant_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_merchant_reference_key UNIQUE (merchant_reference);


--
-- Name: payment_transactions payment_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_pkey PRIMARY KEY (id);


--
-- Name: products products_business_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_business_id_id_key UNIQUE (business_id, id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: purchase_items purchase_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_return_items purchase_return_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_items
    ADD CONSTRAINT purchase_return_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_returns purchase_returns_business_id_return_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_business_id_return_number_key UNIQUE (business_id, return_number);


--
-- Name: purchase_returns purchase_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_pkey PRIMARY KEY (id);


--
-- Name: purchases purchases_business_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_business_id_id_key UNIQUE (business_id, id);


--
-- Name: purchases purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_pkey PRIMARY KEY (id);


--
-- Name: purchases purchases_reference_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_reference_number_key UNIQUE (reference_number);


--
-- Name: sale_items sale_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_pkey PRIMARY KEY (id);


--
-- Name: sale_return_items sale_return_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_return_items
    ADD CONSTRAINT sale_return_items_pkey PRIMARY KEY (id);


--
-- Name: sale_returns sale_returns_business_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_business_id_id_key UNIQUE (business_id, id);


--
-- Name: sale_returns sale_returns_business_id_return_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_business_id_return_number_key UNIQUE (business_id, return_number);


--
-- Name: sale_returns sale_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_pkey PRIMARY KEY (id);


--
-- Name: sales sales_business_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_business_id_id_key UNIQUE (business_id, id);


--
-- Name: sales sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_pkey PRIMARY KEY (id);


--
-- Name: sales sales_receipt_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_receipt_number_key UNIQUE (receipt_number);


--
-- Name: schema_migrations schema_migrations_filename_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_filename_key UNIQUE (filename);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: subscription_plans subscription_plans_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_code_key UNIQUE (code);


--
-- Name: subscription_plans subscription_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: supplier_payments supplier_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_business_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_business_id_id_key UNIQUE (business_id, id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: system_health_checks system_health_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_health_checks
    ADD CONSTRAINT system_health_checks_pkey PRIMARY KEY (id);


--
-- Name: users users_business_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_business_id_id_key UNIQUE (business_id, id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_accounts whatsapp_accounts_business_id_phone_number_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_accounts
    ADD CONSTRAINT whatsapp_accounts_business_id_phone_number_id_key UNIQUE (business_id, phone_number_id);


--
-- Name: whatsapp_accounts whatsapp_accounts_phone_number_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_accounts
    ADD CONSTRAINT whatsapp_accounts_phone_number_id_key UNIQUE (phone_number_id);


--
-- Name: whatsapp_accounts whatsapp_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_accounts
    ADD CONSTRAINT whatsapp_accounts_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_contacts whatsapp_contacts_account_id_wa_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_contacts
    ADD CONSTRAINT whatsapp_contacts_account_id_wa_id_key UNIQUE (account_id, wa_id);


--
-- Name: whatsapp_contacts whatsapp_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_contacts
    ADD CONSTRAINT whatsapp_contacts_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_conversations whatsapp_conversations_account_id_contact_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_account_id_contact_id_key UNIQUE (account_id, contact_id);


--
-- Name: whatsapp_conversations whatsapp_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_messages whatsapp_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_messages whatsapp_messages_wa_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_wa_message_id_key UNIQUE (wa_message_id);


--
-- Name: whatsapp_orders whatsapp_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_orders
    ADD CONSTRAINT whatsapp_orders_pkey PRIMARY KEY (id);


--
-- Name: ai_actions_business_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_actions_business_branch_idx ON public.ai_actions USING btree (business_id, branch_id, created_at DESC);


--
-- Name: ai_memories_business_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_memories_business_idx ON public.ai_memories USING btree (business_id, updated_at DESC);


--
-- Name: ai_memories_business_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_memories_business_type_idx ON public.ai_memories USING btree (business_id, memory_type, updated_at DESC);


--
-- Name: ai_messages_conversation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_messages_conversation_idx ON public.ai_messages USING btree (conversation_id, created_at);


--
-- Name: api_idempotency_keys_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_idempotency_keys_expires_idx ON public.api_idempotency_keys USING btree (expires_at);


--
-- Name: approval_requests_business_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX approval_requests_business_status_idx ON public.approval_requests USING btree (business_id, status, created_at DESC);


--
-- Name: audit_logs_business_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_business_created_idx ON public.audit_logs USING btree (business_id, created_at DESC);


--
-- Name: audit_logs_business_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_business_entity_idx ON public.audit_logs USING btree (business_id, entity_type, entity_id, created_at DESC);


--
-- Name: branches_business_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX branches_business_idx ON public.branches USING btree (business_id, is_active, name);


--
-- Name: businesses_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX businesses_is_active_idx ON public.businesses USING btree (is_active);


--
-- Name: cash_movements_business_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cash_movements_business_created_by_idx ON public.cash_movements USING btree (business_id, created_by, created_at DESC);


--
-- Name: cash_movements_business_register_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cash_movements_business_register_idx ON public.cash_movements USING btree (business_id, register_id, created_at DESC);


--
-- Name: cash_registers_business_opened_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cash_registers_business_opened_idx ON public.cash_registers USING btree (business_id, opened_at DESC);


--
-- Name: cash_registers_one_open_per_business_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cash_registers_one_open_per_business_uidx ON public.cash_registers USING btree (business_id) WHERE ((status)::text = 'open'::text);


--
-- Name: customer_notes_business_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_notes_business_customer_idx ON public.customer_notes USING btree (business_id, customer_id, created_at DESC);


--
-- Name: customers_business_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customers_business_id_idx ON public.customers USING btree (business_id);


--
-- Name: dashboard_widget_preferences_business_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dashboard_widget_preferences_business_user_idx ON public.dashboard_widget_preferences USING btree (business_id, user_id, "position");


--
-- Name: debt_payments_business_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX debt_payments_business_created_by_idx ON public.debt_payments USING btree (business_id, created_by, paid_at DESC);


--
-- Name: debt_payments_business_paid_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX debt_payments_business_paid_at_idx ON public.debt_payments USING btree (business_id, paid_at DESC);


--
-- Name: debts_business_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX debts_business_status_idx ON public.debts USING btree (business_id, status);


--
-- Name: email_verification_tokens_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_verification_tokens_expires_idx ON public.email_verification_tokens USING btree (expires_at);


--
-- Name: expenses_business_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_business_branch_idx ON public.expenses USING btree (business_id, branch_id, expense_date DESC);


--
-- Name: idx_ai_conversations_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_conversations_business_branch ON public.ai_conversations USING btree (business_id, branch_id);


--
-- Name: idx_ai_memories_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_memories_business_branch ON public.ai_memories USING btree (business_id, branch_id);


--
-- Name: idx_ai_messages_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_messages_business_branch ON public.ai_messages USING btree (business_id, branch_id);


--
-- Name: idx_api_idempotency_keys_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_idempotency_keys_business_branch ON public.api_idempotency_keys USING btree (business_id, branch_id);


--
-- Name: idx_approval_requests_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_requests_business_branch ON public.approval_requests USING btree (business_id, branch_id);


--
-- Name: idx_audit_logs_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_business_branch ON public.audit_logs USING btree (business_id, branch_id);


--
-- Name: idx_cash_movements_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cash_movements_business_branch ON public.cash_movements USING btree (business_id, branch_id);


--
-- Name: idx_cash_registers_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cash_registers_business_branch ON public.cash_registers USING btree (business_id, branch_id);


--
-- Name: idx_customer_notes_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_notes_business_branch ON public.customer_notes USING btree (business_id, branch_id);


--
-- Name: idx_customers_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_business_branch ON public.customers USING btree (business_id, branch_id);


--
-- Name: idx_customers_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_name ON public.customers USING btree (name);


--
-- Name: idx_customers_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_phone ON public.customers USING btree (phone);


--
-- Name: idx_dashboard_widget_preferences_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dashboard_widget_preferences_business_branch ON public.dashboard_widget_preferences USING btree (business_id, branch_id);


--
-- Name: idx_debt_payments_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debt_payments_business_branch ON public.debt_payments USING btree (business_id, branch_id);


--
-- Name: idx_debt_payments_debt_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debt_payments_debt_id ON public.debt_payments USING btree (debt_id);


--
-- Name: idx_debt_payments_paid_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debt_payments_paid_at ON public.debt_payments USING btree (paid_at DESC);


--
-- Name: idx_debts_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debts_business_branch ON public.debts USING btree (business_id, branch_id);


--
-- Name: idx_debts_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debts_customer_id ON public.debts USING btree (customer_id);


--
-- Name: idx_debts_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debts_due_date ON public.debts USING btree (due_date);


--
-- Name: idx_debts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debts_status ON public.debts USING btree (status);


--
-- Name: idx_loyalty_accounts_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loyalty_accounts_business_branch ON public.loyalty_accounts USING btree (business_id, branch_id);


--
-- Name: idx_loyalty_transactions_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loyalty_transactions_business_branch ON public.loyalty_transactions USING btree (business_id, branch_id);


--
-- Name: idx_notifications_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_business_branch ON public.notifications USING btree (business_id, branch_id);


--
-- Name: idx_offline_mutations_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_offline_mutations_business_branch ON public.offline_mutations USING btree (business_id, branch_id);


--
-- Name: idx_products_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_business_branch ON public.products USING btree (business_id, branch_id);


--
-- Name: idx_purchase_items_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_items_business_branch ON public.purchase_items USING btree (business_id, branch_id);


--
-- Name: idx_purchase_items_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_items_product_id ON public.purchase_items USING btree (product_id);


--
-- Name: idx_purchase_items_purchase_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_items_purchase_id ON public.purchase_items USING btree (purchase_id);


--
-- Name: idx_purchase_return_items_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_return_items_business_branch ON public.purchase_return_items USING btree (business_id, branch_id);


--
-- Name: idx_purchase_returns_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_returns_business_branch ON public.purchase_returns USING btree (business_id, branch_id);


--
-- Name: idx_purchases_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchases_business_branch ON public.purchases USING btree (business_id, branch_id);


--
-- Name: idx_purchases_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchases_created_at ON public.purchases USING btree (created_at DESC);


--
-- Name: idx_purchases_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchases_supplier_id ON public.purchases USING btree (supplier_id);


--
-- Name: idx_sale_items_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_items_business_branch ON public.sale_items USING btree (business_id, branch_id);


--
-- Name: idx_sale_items_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_items_product_id ON public.sale_items USING btree (product_id);


--
-- Name: idx_sale_items_sale_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_items_sale_id ON public.sale_items USING btree (sale_id);


--
-- Name: idx_sale_return_items_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_return_items_business_branch ON public.sale_return_items USING btree (business_id, branch_id);


--
-- Name: idx_sale_returns_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_returns_business_branch ON public.sale_returns USING btree (business_id, branch_id);


--
-- Name: idx_sales_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_business_branch ON public.sales USING btree (business_id, branch_id);


--
-- Name: idx_sales_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_created_at ON public.sales USING btree (created_at DESC);


--
-- Name: idx_sales_receipt_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_receipt_number ON public.sales USING btree (receipt_number);


--
-- Name: idx_stock_movements_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_business_branch ON public.stock_movements USING btree (business_id, branch_id);


--
-- Name: idx_supplier_payments_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_payments_business_branch ON public.supplier_payments USING btree (business_id, branch_id);


--
-- Name: idx_suppliers_business_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_business_branch ON public.suppliers USING btree (business_id, branch_id);


--
-- Name: idx_suppliers_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_name ON public.suppliers USING btree (name);


--
-- Name: idx_suppliers_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_phone ON public.suppliers USING btree (phone);


--
-- Name: idx_users_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_active ON public.users USING btree (is_active);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: loyalty_transactions_business_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loyalty_transactions_business_account_idx ON public.loyalty_transactions USING btree (business_id, account_id, created_at DESC);


--
-- Name: notifications_business_user_read_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_business_user_read_idx ON public.notifications USING btree (business_id, user_id, is_read, created_at DESC);


--
-- Name: offline_mutations_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offline_mutations_user_idx ON public.offline_mutations USING btree (user_id, created_at DESC);


--
-- Name: password_reset_tokens_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX password_reset_tokens_expires_idx ON public.password_reset_tokens USING btree (expires_at);


--
-- Name: payment_transactions_business_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_transactions_business_idx ON public.payment_transactions USING btree (business_id, created_at DESC);


--
-- Name: payment_transactions_tracking_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_transactions_tracking_idx ON public.payment_transactions USING btree (provider_tracking_id);


--
-- Name: products_business_barcode_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX products_business_barcode_uidx ON public.products USING btree (business_id, barcode) WHERE (barcode IS NOT NULL);


--
-- Name: products_business_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_business_id_idx ON public.products USING btree (business_id);


--
-- Name: products_business_image_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_business_image_idx ON public.products USING btree (business_id) WHERE (image_key IS NOT NULL);


--
-- Name: products_business_sku_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX products_business_sku_uidx ON public.products USING btree (business_id, lower((sku)::text)) WHERE (sku IS NOT NULL);


--
-- Name: purchase_items_business_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_items_business_id_idx ON public.purchase_items USING btree (business_id);


--
-- Name: purchase_return_items_business_return_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_return_items_business_return_idx ON public.purchase_return_items USING btree (business_id, return_id);


--
-- Name: purchase_returns_business_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_returns_business_created_idx ON public.purchase_returns USING btree (business_id, created_at DESC);


--
-- Name: purchase_returns_business_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX purchase_returns_business_id_id_key ON public.purchase_returns USING btree (business_id, id);


--
-- Name: purchases_business_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchases_business_created_at_idx ON public.purchases USING btree (business_id, created_at DESC);


--
-- Name: purchases_business_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchases_business_created_by_idx ON public.purchases USING btree (business_id, created_by, created_at DESC);


--
-- Name: sale_items_business_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sale_items_business_id_idx ON public.sale_items USING btree (business_id);


--
-- Name: sale_returns_business_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sale_returns_business_created_by_idx ON public.sale_returns USING btree (business_id, created_by, created_at DESC);


--
-- Name: sale_returns_business_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sale_returns_business_created_idx ON public.sale_returns USING btree (business_id, created_at DESC);


--
-- Name: sales_business_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_business_created_at_idx ON public.sales USING btree (business_id, created_at DESC);


--
-- Name: sales_business_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_business_created_by_idx ON public.sales USING btree (business_id, created_by, created_at DESC);


--
-- Name: stock_movements_business_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_business_created_by_idx ON public.stock_movements USING btree (business_id, created_by, created_at DESC);


--
-- Name: stock_movements_business_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_business_created_idx ON public.stock_movements USING btree (business_id, created_at DESC);


--
-- Name: stock_movements_business_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_business_product_idx ON public.stock_movements USING btree (business_id, product_id, created_at DESC);


--
-- Name: subscriptions_business_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_business_idx ON public.subscriptions USING btree (business_id, updated_at DESC);


--
-- Name: subscriptions_one_current_per_business_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX subscriptions_one_current_per_business_uidx ON public.subscriptions USING btree (business_id) WHERE ((status)::text = ANY ((ARRAY['trial'::character varying, 'active'::character varying, 'past_due'::character varying])::text[]));


--
-- Name: supplier_payments_business_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplier_payments_business_created_by_idx ON public.supplier_payments USING btree (business_id, created_by, paid_at DESC);


--
-- Name: supplier_payments_business_supplier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplier_payments_business_supplier_idx ON public.supplier_payments USING btree (business_id, supplier_id, paid_at DESC);


--
-- Name: suppliers_business_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX suppliers_business_id_idx ON public.suppliers USING btree (business_id);


--
-- Name: system_health_component_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX system_health_component_idx ON public.system_health_checks USING btree (component, checked_at DESC);


--
-- Name: users_business_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_business_id_idx ON public.users USING btree (business_id);


--
-- Name: whatsapp_accounts_business_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_accounts_business_idx ON public.whatsapp_accounts USING btree (business_id, branch_id);


--
-- Name: whatsapp_contacts_business_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_contacts_business_idx ON public.whatsapp_contacts USING btree (business_id, updated_at DESC);


--
-- Name: whatsapp_conversations_business_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_conversations_business_idx ON public.whatsapp_conversations USING btree (business_id, status, last_message_at DESC);


--
-- Name: whatsapp_messages_conversation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_messages_conversation_idx ON public.whatsapp_messages USING btree (conversation_id, created_at);


--
-- Name: whatsapp_orders_business_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_orders_business_idx ON public.whatsapp_orders USING btree (business_id, created_at DESC);


--
-- Name: api_idempotency_keys api_idempotency_cleanup_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER api_idempotency_cleanup_trigger AFTER INSERT ON public.api_idempotency_keys FOR EACH STATEMENT EXECUTE FUNCTION public.dukaflow_cleanup_idempotency_keys();


--
-- Name: businesses businesses_default_subscription_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER businesses_default_subscription_trigger AFTER INSERT ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.dukaflow_create_default_subscription();


--
-- Name: dashboard_widget_preferences dashboard_widget_preferences_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dashboard_widget_preferences_updated_at_trigger BEFORE UPDATE ON public.dashboard_widget_preferences FOR EACH ROW EXECUTE FUNCTION public.dukaflow_touch_dashboard_widget_preferences();


--
-- Name: ai_conversations dukaflow_assign_branch_ai_conversations; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_ai_conversations BEFORE INSERT ON public.ai_conversations FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: ai_memories dukaflow_assign_branch_ai_memories; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_ai_memories BEFORE INSERT ON public.ai_memories FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: ai_messages dukaflow_assign_branch_ai_messages; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_ai_messages BEFORE INSERT ON public.ai_messages FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: api_idempotency_keys dukaflow_assign_branch_api_idempotency_keys; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_api_idempotency_keys BEFORE INSERT ON public.api_idempotency_keys FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: approval_requests dukaflow_assign_branch_approval_requests; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_approval_requests BEFORE INSERT ON public.approval_requests FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: audit_logs dukaflow_assign_branch_audit_logs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_audit_logs BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: cash_movements dukaflow_assign_branch_cash_movements; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_cash_movements BEFORE INSERT ON public.cash_movements FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: cash_registers dukaflow_assign_branch_cash_registers; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_cash_registers BEFORE INSERT ON public.cash_registers FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: customer_notes dukaflow_assign_branch_customer_notes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_customer_notes BEFORE INSERT ON public.customer_notes FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: customers dukaflow_assign_branch_customers; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_customers BEFORE INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: dashboard_widget_preferences dukaflow_assign_branch_dashboard_widget_preferences; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_dashboard_widget_preferences BEFORE INSERT ON public.dashboard_widget_preferences FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: debt_payments dukaflow_assign_branch_debt_payments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_debt_payments BEFORE INSERT ON public.debt_payments FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: debts dukaflow_assign_branch_debts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_debts BEFORE INSERT ON public.debts FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: expenses dukaflow_assign_branch_expenses; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_expenses BEFORE INSERT ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: loyalty_accounts dukaflow_assign_branch_loyalty_accounts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_loyalty_accounts BEFORE INSERT ON public.loyalty_accounts FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: loyalty_transactions dukaflow_assign_branch_loyalty_transactions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_loyalty_transactions BEFORE INSERT ON public.loyalty_transactions FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: notifications dukaflow_assign_branch_notifications; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_notifications BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: offline_mutations dukaflow_assign_branch_offline_mutations; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_offline_mutations BEFORE INSERT ON public.offline_mutations FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: products dukaflow_assign_branch_products; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_products BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: purchase_items dukaflow_assign_branch_purchase_items; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_purchase_items BEFORE INSERT ON public.purchase_items FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: purchase_return_items dukaflow_assign_branch_purchase_return_items; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_purchase_return_items BEFORE INSERT ON public.purchase_return_items FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: purchase_returns dukaflow_assign_branch_purchase_returns; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_purchase_returns BEFORE INSERT ON public.purchase_returns FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: purchases dukaflow_assign_branch_purchases; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_purchases BEFORE INSERT ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: sale_items dukaflow_assign_branch_sale_items; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_sale_items BEFORE INSERT ON public.sale_items FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: sale_return_items dukaflow_assign_branch_sale_return_items; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_sale_return_items BEFORE INSERT ON public.sale_return_items FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: sale_returns dukaflow_assign_branch_sale_returns; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_sale_returns BEFORE INSERT ON public.sale_returns FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: sales dukaflow_assign_branch_sales; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_sales BEFORE INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: stock_movements dukaflow_assign_branch_stock_movements; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_stock_movements BEFORE INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: supplier_payments dukaflow_assign_branch_supplier_payments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_supplier_payments BEFORE INSERT ON public.supplier_payments FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: suppliers dukaflow_assign_branch_suppliers; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dukaflow_assign_branch_suppliers BEFORE INSERT ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.dukaflow_assign_branch_id();


--
-- Name: expenses expenses_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER expenses_updated_at_trigger BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.dukaflow_touch_expenses();


--
-- Name: loyalty_accounts loyalty_accounts_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER loyalty_accounts_updated_at_trigger BEFORE UPDATE ON public.loyalty_accounts FOR EACH ROW EXECUTE FUNCTION public.dukaflow_touch_updated_at();


--
-- Name: subscription_plans subscription_plans_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER subscription_plans_updated_at_trigger BEFORE UPDATE ON public.subscription_plans FOR EACH ROW EXECUTE FUNCTION public.dukaflow_touch_updated_at();


--
-- Name: subscriptions subscriptions_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER subscriptions_updated_at_trigger BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.dukaflow_touch_updated_at();


--
-- Name: ai_actions ai_actions_business_id_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_actions
    ADD CONSTRAINT ai_actions_business_id_branch_id_fkey FOREIGN KEY (business_id, branch_id) REFERENCES public.branches(business_id, id);


--
-- Name: ai_actions ai_actions_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_actions
    ADD CONSTRAINT ai_actions_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: ai_actions ai_actions_business_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_actions
    ADD CONSTRAINT ai_actions_business_id_user_id_fkey FOREIGN KEY (business_id, user_id) REFERENCES public.users(business_id, id);


--
-- Name: ai_conversations ai_conversations_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: ai_conversations ai_conversations_business_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_business_id_user_id_fkey FOREIGN KEY (business_id, user_id) REFERENCES public.users(business_id, id) ON DELETE CASCADE;


--
-- Name: ai_memories ai_memories_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_memories
    ADD CONSTRAINT ai_memories_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: ai_messages ai_messages_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_messages
    ADD CONSTRAINT ai_messages_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: ai_messages ai_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_messages
    ADD CONSTRAINT ai_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.ai_conversations(id) ON DELETE CASCADE;


--
-- Name: api_idempotency_keys api_idempotency_keys_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_idempotency_keys
    ADD CONSTRAINT api_idempotency_keys_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: api_idempotency_keys api_idempotency_keys_business_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_idempotency_keys
    ADD CONSTRAINT api_idempotency_keys_business_user_fkey FOREIGN KEY (business_id, user_id) REFERENCES public.users(business_id, id) ON DELETE RESTRICT;


--
-- Name: approval_requests approval_requests_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: approval_requests approval_requests_business_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_business_requested_by_fkey FOREIGN KEY (business_id, requested_by) REFERENCES public.users(business_id, id) ON DELETE RESTRICT;


--
-- Name: approval_requests approval_requests_business_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_business_reviewed_by_fkey FOREIGN KEY (business_id, reviewed_by) REFERENCES public.users(business_id, id) ON DELETE RESTRICT;


--
-- Name: audit_logs audit_logs_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_business_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_business_user_fkey FOREIGN KEY (business_id, user_id) REFERENCES public.users(business_id, id) ON DELETE RESTRICT;


--
-- Name: branches branches_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: cash_movements cash_movements_business_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_movements
    ADD CONSTRAINT cash_movements_business_created_by_fkey FOREIGN KEY (business_id, created_by) REFERENCES public.users(business_id, id) ON DELETE RESTRICT;


--
-- Name: cash_movements cash_movements_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_movements
    ADD CONSTRAINT cash_movements_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: cash_movements cash_movements_business_register_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_movements
    ADD CONSTRAINT cash_movements_business_register_fkey FOREIGN KEY (business_id, register_id) REFERENCES public.cash_registers(business_id, id) ON DELETE CASCADE;


--
-- Name: cash_registers cash_registers_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_registers
    ADD CONSTRAINT cash_registers_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: cash_registers cash_registers_business_opened_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_registers
    ADD CONSTRAINT cash_registers_business_opened_by_fkey FOREIGN KEY (business_id, opened_by) REFERENCES public.users(business_id, id) ON DELETE RESTRICT;


--
-- Name: customer_notes customer_notes_business_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_notes
    ADD CONSTRAINT customer_notes_business_created_by_fkey FOREIGN KEY (business_id, created_by) REFERENCES public.users(business_id, id) ON DELETE RESTRICT;


--
-- Name: customer_notes customer_notes_business_customer_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_notes
    ADD CONSTRAINT customer_notes_business_customer_fkey FOREIGN KEY (business_id, customer_id) REFERENCES public.customers(business_id, id) ON DELETE CASCADE;


--
-- Name: customer_notes customer_notes_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_notes
    ADD CONSTRAINT customer_notes_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: customers customers_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: dashboard_widget_preferences dashboard_widget_preferences_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_widget_preferences
    ADD CONSTRAINT dashboard_widget_preferences_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: dashboard_widget_preferences dashboard_widget_preferences_business_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_widget_preferences
    ADD CONSTRAINT dashboard_widget_preferences_business_user_fkey FOREIGN KEY (business_id, user_id) REFERENCES public.users(business_id, id) ON DELETE CASCADE;


--
-- Name: debt_payments debt_payments_business_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_payments
    ADD CONSTRAINT debt_payments_business_created_by_fkey FOREIGN KEY (business_id, created_by) REFERENCES public.users(business_id, id) ON DELETE RESTRICT;


--
-- Name: debt_payments debt_payments_business_debt_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_payments
    ADD CONSTRAINT debt_payments_business_debt_fkey FOREIGN KEY (business_id, debt_id) REFERENCES public.debts(business_id, id) ON DELETE CASCADE;


--
-- Name: debt_payments debt_payments_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_payments
    ADD CONSTRAINT debt_payments_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: debt_payments debt_payments_debt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_payments
    ADD CONSTRAINT debt_payments_debt_id_fkey FOREIGN KEY (debt_id) REFERENCES public.debts(id) ON DELETE CASCADE;


--
-- Name: debts debts_business_customer_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_business_customer_fkey FOREIGN KEY (business_id, customer_id) REFERENCES public.customers(business_id, id) ON DELETE RESTRICT;


--
-- Name: debts debts_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: debts debts_business_sale_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_business_sale_fkey FOREIGN KEY (business_id, sale_id) REFERENCES public.sales(business_id, id) ON DELETE CASCADE;


--
-- Name: debts debts_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;


--
-- Name: debts debts_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;


--
-- Name: email_verification_tokens email_verification_tokens_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: email_verification_tokens email_verification_tokens_business_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_business_id_user_id_fkey FOREIGN KEY (business_id, user_id) REFERENCES public.users(business_id, id) ON DELETE CASCADE;


--
-- Name: expenses expenses_business_id_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_business_id_branch_id_fkey FOREIGN KEY (business_id, branch_id) REFERENCES public.branches(business_id, id);


--
-- Name: expenses expenses_business_id_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_business_id_created_by_fkey FOREIGN KEY (business_id, created_by) REFERENCES public.users(business_id, id);


--
-- Name: expenses expenses_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: loyalty_accounts loyalty_accounts_business_customer_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_accounts
    ADD CONSTRAINT loyalty_accounts_business_customer_fkey FOREIGN KEY (business_id, customer_id) REFERENCES public.customers(business_id, id) ON DELETE CASCADE;


--
-- Name: loyalty_accounts loyalty_accounts_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_accounts
    ADD CONSTRAINT loyalty_accounts_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: loyalty_transactions loyalty_transactions_business_account_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_business_account_fkey FOREIGN KEY (business_id, account_id) REFERENCES public.loyalty_accounts(business_id, id) ON DELETE CASCADE;


--
-- Name: loyalty_transactions loyalty_transactions_business_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_business_created_by_fkey FOREIGN KEY (business_id, created_by) REFERENCES public.users(business_id, id) ON DELETE RESTRICT;


--
-- Name: loyalty_transactions loyalty_transactions_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: loyalty_transactions loyalty_transactions_business_sale_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_business_sale_fkey FOREIGN KEY (business_id, sale_id) REFERENCES public.sales(business_id, id) ON DELETE RESTRICT;


--
-- Name: notifications notifications_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_business_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_business_user_fkey FOREIGN KEY (business_id, user_id) REFERENCES public.users(business_id, id) ON DELETE CASCADE;


--
-- Name: offline_mutations offline_mutations_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_mutations
    ADD CONSTRAINT offline_mutations_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_business_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_business_user_fkey FOREIGN KEY (business_id, user_id) REFERENCES public.users(business_id, id) ON DELETE CASCADE;


--
-- Name: payment_transactions payment_transactions_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: products products_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: purchase_items purchase_items_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: purchase_items purchase_items_business_product_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_business_product_fkey FOREIGN KEY (business_id, product_id) REFERENCES public.products(business_id, id) ON DELETE RESTRICT;


--
-- Name: purchase_items purchase_items_business_purchase_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_business_purchase_fkey FOREIGN KEY (business_id, purchase_id) REFERENCES public.purchases(business_id, id) ON DELETE CASCADE;


--
-- Name: purchase_items purchase_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: purchase_items purchase_items_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE CASCADE;


--
-- Name: purchase_return_items purchase_return_items_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_items
    ADD CONSTRAINT purchase_return_items_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: purchase_return_items purchase_return_items_business_product_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_items
    ADD CONSTRAINT purchase_return_items_business_product_fkey FOREIGN KEY (business_id, product_id) REFERENCES public.products(business_id, id) ON DELETE RESTRICT;


--
-- Name: purchase_return_items purchase_return_items_business_return_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_items
    ADD CONSTRAINT purchase_return_items_business_return_fkey FOREIGN KEY (business_id, return_id) REFERENCES public.purchase_returns(business_id, id) ON DELETE CASCADE;


--
-- Name: purchase_returns purchase_returns_business_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_business_created_by_fkey FOREIGN KEY (business_id, created_by) REFERENCES public.users(business_id, id) ON DELETE RESTRICT;


--
-- Name: purchase_returns purchase_returns_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: purchase_returns purchase_returns_business_purchase_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_business_purchase_fkey FOREIGN KEY (business_id, purchase_id) REFERENCES public.purchases(business_id, id) ON DELETE RESTRICT;


--
-- Name: purchase_returns purchase_returns_business_supplier_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_business_supplier_fkey FOREIGN KEY (business_id, supplier_id) REFERENCES public.suppliers(business_id, id) ON DELETE RESTRICT;


--
-- Name: purchases purchases_business_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_business_created_by_fkey FOREIGN KEY (business_id, created_by) REFERENCES public.users(business_id, id) ON DELETE RESTRICT;


--
-- Name: purchases purchases_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: purchases purchases_business_supplier_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_business_supplier_fkey FOREIGN KEY (business_id, supplier_id) REFERENCES public.suppliers(business_id, id) ON DELETE RESTRICT;


--
-- Name: purchases purchases_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: sale_items sale_items_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: sale_items sale_items_business_product_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_business_product_fkey FOREIGN KEY (business_id, product_id) REFERENCES public.products(business_id, id) ON DELETE RESTRICT;


--
-- Name: sale_items sale_items_business_sale_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_business_sale_fkey FOREIGN KEY (business_id, sale_id) REFERENCES public.sales(business_id, id) ON DELETE CASCADE;


--
-- Name: sale_items sale_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: sale_items sale_items_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;


--
-- Name: sale_return_items sale_return_items_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_return_items
    ADD CONSTRAINT sale_return_items_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: sale_return_items sale_return_items_business_product_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_return_items
    ADD CONSTRAINT sale_return_items_business_product_fkey FOREIGN KEY (business_id, product_id) REFERENCES public.products(business_id, id) ON DELETE RESTRICT;


--
-- Name: sale_return_items sale_return_items_business_return_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_return_items
    ADD CONSTRAINT sale_return_items_business_return_fkey FOREIGN KEY (business_id, return_id) REFERENCES public.sale_returns(business_id, id) ON DELETE CASCADE;


--
-- Name: sale_returns sale_returns_business_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_business_created_by_fkey FOREIGN KEY (business_id, created_by) REFERENCES public.users(business_id, id) ON DELETE RESTRICT;


--
-- Name: sale_returns sale_returns_business_customer_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_business_customer_fkey FOREIGN KEY (business_id, customer_id) REFERENCES public.customers(business_id, id) ON DELETE RESTRICT;


--
-- Name: sale_returns sale_returns_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: sale_returns sale_returns_business_sale_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_business_sale_fkey FOREIGN KEY (business_id, sale_id) REFERENCES public.sales(business_id, id) ON DELETE RESTRICT;


--
-- Name: sales sales_business_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_business_created_by_fkey FOREIGN KEY (business_id, created_by) REFERENCES public.users(business_id, id) ON DELETE RESTRICT;


--
-- Name: sales sales_business_customer_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_business_customer_fkey FOREIGN KEY (business_id, customer_id) REFERENCES public.customers(business_id, id) ON DELETE RESTRICT;


--
-- Name: sales sales_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: sales sales_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: stock_movements stock_movements_business_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_business_created_by_fkey FOREIGN KEY (business_id, created_by) REFERENCES public.users(business_id, id) ON DELETE RESTRICT;


--
-- Name: stock_movements stock_movements_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: stock_movements stock_movements_business_product_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_business_product_fkey FOREIGN KEY (business_id, product_id) REFERENCES public.products(business_id, id) ON DELETE RESTRICT;


--
-- Name: subscriptions subscriptions_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id) ON DELETE RESTRICT;


--
-- Name: supplier_payments supplier_payments_business_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_business_created_by_fkey FOREIGN KEY (business_id, created_by) REFERENCES public.users(business_id, id) ON DELETE RESTRICT;


--
-- Name: supplier_payments supplier_payments_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: supplier_payments supplier_payments_business_purchase_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_business_purchase_fkey FOREIGN KEY (business_id, purchase_id) REFERENCES public.purchases(business_id, id) ON DELETE CASCADE;


--
-- Name: supplier_payments supplier_payments_business_supplier_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_business_supplier_fkey FOREIGN KEY (business_id, supplier_id) REFERENCES public.suppliers(business_id, id) ON DELETE RESTRICT;


--
-- Name: suppliers suppliers_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: users users_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;


--
-- Name: users users_default_branch_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_default_branch_fkey FOREIGN KEY (default_branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: whatsapp_accounts whatsapp_accounts_business_branch_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_accounts
    ADD CONSTRAINT whatsapp_accounts_business_branch_fkey FOREIGN KEY (business_id, branch_id) REFERENCES public.branches(business_id, id) ON DELETE CASCADE;


--
-- Name: whatsapp_accounts whatsapp_accounts_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_accounts
    ADD CONSTRAINT whatsapp_accounts_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: whatsapp_contacts whatsapp_contacts_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_contacts
    ADD CONSTRAINT whatsapp_contacts_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.whatsapp_accounts(id) ON DELETE CASCADE;


--
-- Name: whatsapp_contacts whatsapp_contacts_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_contacts
    ADD CONSTRAINT whatsapp_contacts_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: whatsapp_conversations whatsapp_conversations_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.whatsapp_accounts(id) ON DELETE CASCADE;


--
-- Name: whatsapp_conversations whatsapp_conversations_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: whatsapp_conversations whatsapp_conversations_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.whatsapp_contacts(id) ON DELETE CASCADE;


--
-- Name: whatsapp_messages whatsapp_messages_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: whatsapp_messages whatsapp_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE;


--
-- Name: whatsapp_orders whatsapp_orders_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_orders
    ADD CONSTRAINT whatsapp_orders_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: whatsapp_orders whatsapp_orders_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_orders
    ADD CONSTRAINT whatsapp_orders_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE;


--
-- Name: ai_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_memories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_memories ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: api_idempotency_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_idempotency_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: cash_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: cash_registers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: dashboard_widget_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dashboard_widget_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: debt_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: debts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_actions dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.ai_actions USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: ai_conversations dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.ai_conversations USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: ai_memories dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.ai_memories USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: ai_messages dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.ai_messages USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: api_idempotency_keys dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.api_idempotency_keys USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: approval_requests dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.approval_requests USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: audit_logs dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.audit_logs USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: cash_movements dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.cash_movements USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: cash_registers dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.cash_registers USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: customer_notes dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.customer_notes USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: customers dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.customers USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: dashboard_widget_preferences dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.dashboard_widget_preferences USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: debt_payments dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.debt_payments USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: debts dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.debts USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: expenses dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.expenses USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: loyalty_accounts dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.loyalty_accounts USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: loyalty_transactions dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.loyalty_transactions USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: notifications dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.notifications USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: offline_mutations dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.offline_mutations USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: products dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.products USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: purchase_items dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.purchase_items USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: purchase_return_items dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.purchase_return_items USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: purchase_returns dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.purchase_returns USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: purchases dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.purchases USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: sale_items dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.sale_items USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: sale_return_items dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.sale_return_items USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: sale_returns dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.sale_returns USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: sales dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.sales USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: stock_movements dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.stock_movements USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: supplier_payments dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.supplier_payments USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: suppliers dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.suppliers USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: whatsapp_accounts dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.whatsapp_accounts USING (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id()))) WITH CHECK (((business_id = public.dukaflow_current_business_id()) AND (branch_id = public.dukaflow_current_branch_id())));


--
-- Name: whatsapp_contacts dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.whatsapp_contacts USING ((business_id = public.dukaflow_current_business_id())) WITH CHECK ((business_id = public.dukaflow_current_business_id()));


--
-- Name: whatsapp_conversations dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.whatsapp_conversations USING ((business_id = public.dukaflow_current_business_id())) WITH CHECK ((business_id = public.dukaflow_current_business_id()));


--
-- Name: whatsapp_messages dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.whatsapp_messages USING ((business_id = public.dukaflow_current_business_id())) WITH CHECK ((business_id = public.dukaflow_current_business_id()));


--
-- Name: whatsapp_orders dukaflow_branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dukaflow_branch_isolation ON public.whatsapp_orders USING ((business_id = public.dukaflow_current_business_id())) WITH CHECK ((business_id = public.dukaflow_current_business_id()));


--
-- Name: expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: loyalty_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: loyalty_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: offline_mutations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.offline_mutations ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_return_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_return_items ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_returns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;

--
-- Name: purchases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_return_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_return_items ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_returns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;

--
-- Name: sales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_accounts whatsapp_accounts_webhook_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY whatsapp_accounts_webhook_select ON public.whatsapp_accounts FOR SELECT USING (((current_setting('app.whatsapp_phone_number_id'::text, true) <> ''::text) AND ((phone_number_id)::text = current_setting('app.whatsapp_phone_number_id'::text, true))));


--
-- Name: whatsapp_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_orders ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict yMjKsAxsyhKFbdHC8PZqaIeUQ9YJpJwO8GbG77tomiJbXvDOwvVdKcXBKguRC6a

